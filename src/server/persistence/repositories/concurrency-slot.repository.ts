import 'server-only';
import { PoolClient } from 'pg';
import { ConcurrencySlotRow } from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface SlotAcquisitionResult {
  readonly acquired: boolean;
  readonly scopeKey: string;
  readonly slotNumber?: number | undefined;
  readonly holderId: string;
  readonly leaseExpiresAt?: string | undefined;
  readonly reason?: string | undefined;
}

export class ConcurrencySlotRepository {
  /**
   * Attempts to acquire an atomic concurrency slot for a given scope.
   * Cleans up expired slot leases and allocates the lowest unoccupied slot number.
   */
  async acquireSlot(
    scopeKey: string,
    maxSlots: number,
    holderId: string,
    leaseDurationMs: number = 30000,
    tx?: TransactionContext | PoolClient
  ): Promise<SlotAcquisitionResult> {
    const executor = getExecutor(tx);

    try {
      // 1. Purge expired leases for this scope
      await executeQuery(
        executor,
        'DELETE FROM concurrency_slots WHERE scope_key = $1 AND lease_expires_at < NOW()',
        [scopeKey]
      );

      // 2. Check if holder already has an active slot
      const existing = await executeQuery<ConcurrencySlotRow>(
        executor,
        'SELECT * FROM concurrency_slots WHERE scope_key = $1 AND holder_id = $2 AND lease_expires_at >= NOW()',
        [scopeKey, holderId]
      );
      if (existing.rows[0]) {
        return {
          acquired: true,
          scopeKey,
          slotNumber: existing.rows[0].slot_number,
          holderId,
          leaseExpiresAt: existing.rows[0].lease_expires_at,
        };
      }

      // 3. Find lowest available slot number <= maxSlots
      const findSql = `
        WITH candidates AS (
          SELECT generate_series(1, $2::int) AS slot_number
        ),
        active_slots AS (
          SELECT slot_number
          FROM concurrency_slots
          WHERE scope_key = $1 AND lease_expires_at >= NOW()
        )
        SELECT c.slot_number
        FROM candidates c
        LEFT JOIN active_slots a ON c.slot_number = a.slot_number
        WHERE a.slot_number IS NULL
        ORDER BY c.slot_number ASC
        LIMIT 1
      `;
      const slotRes = await executeQuery<{ slot_number: number }>(executor, findSql, [
        scopeKey,
        maxSlots,
      ]);

      const availableSlot = slotRes.rows[0]?.slot_number;
      if (!availableSlot) {
        return {
          acquired: false,
          scopeKey,
          holderId,
          reason: `Concurrency limit of ${maxSlots} reached for scope "${scopeKey}"`,
        };
      }

      // 4. Insert slot lease
      const insertSql = `
        INSERT INTO concurrency_slots (
          scope_key, holder_id, slot_number, max_slots, lease_expires_at
        ) VALUES (
          $1, $2, $3, $4, NOW() + ($5 || ' milliseconds')::INTERVAL
        )
        RETURNING *
      `;
      const insertRes = await executeQuery<ConcurrencySlotRow>(executor, insertSql, [
        scopeKey,
        holderId,
        availableSlot,
        maxSlots,
        Math.max(1000, Math.floor(leaseDurationMs)).toString(),
      ]);

      const row = insertRes.rows[0];
      return {
        acquired: true,
        scopeKey,
        slotNumber: row?.slot_number ?? availableSlot,
        holderId,
        leaseExpiresAt: row?.lease_expires_at,
      };
    } catch (err: unknown) {
      // In high-concurrency race on slot_number unique constraint, return gracefully as saturated
      return {
        acquired: false,
        scopeKey,
        holderId,
        reason: `Slot contention encountered: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Safely releases a held slot.
   */
  async releaseSlot(
    scopeKey: string,
    holderId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<boolean> {
    const executor = getExecutor(tx);
    const sql = 'DELETE FROM concurrency_slots WHERE scope_key = $1 AND holder_id = $2';
    const result = await executeQuery(executor, sql, [scopeKey, holderId]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Extends the lease deadline for a held slot.
   */
  async renewSlot(
    scopeKey: string,
    holderId: string,
    leaseDurationMs: number = 30000,
    tx?: TransactionContext | PoolClient
  ): Promise<boolean> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE concurrency_slots
      SET lease_expires_at = NOW() + ($3 || ' milliseconds')::INTERVAL
      WHERE scope_key = $1 AND holder_id = $2
      RETURNING id
    `;
    const result = await executeQuery(executor, sql, [
      scopeKey,
      holderId,
      Math.max(1000, Math.floor(leaseDurationMs)).toString(),
    ]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Returns current active active slot count for a scope.
   */
  async getActiveCount(
    scopeKey: string,
    tx?: TransactionContext | PoolClient
  ): Promise<number> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT COUNT(*)::int AS count
      FROM concurrency_slots
      WHERE scope_key = $1 AND lease_expires_at >= NOW()
    `;
    const res = await executeQuery<{ count: number }>(executor, sql, [scopeKey]);
    return res.rows[0]?.count ?? 0;
  }
}

