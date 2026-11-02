import 'server-only';
import { PoolClient } from 'pg';
import { ProviderConfigurationRow } from '../types';
import { TransactionContext } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';

export interface CreateProviderConfigInput {
  id?: string | undefined;
  user_id: string;
  provider_id?: ('openai' | 'openrouter' | 'nim' | 'tavily' | 'exa' | 'firecrawl') | undefined;
  provider_name?: string | undefined;
  provider_type?: string | undefined;
  model_name?: string | null | undefined;
  selected_model_id?: string | null | undefined;
  custom_base_url?: string | null | undefined;
  is_enabled?: boolean | undefined;
  is_healthy?: boolean | undefined;
  has_credential?: boolean | undefined;
  credential_preview?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export class ProviderConfigRepository {
  /**
   * Retrieves a single provider configuration by ID.
   */
  async findById(
    id: string,
    userId?: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderConfigurationRow | null> {
    const executor = getExecutor(tx);
    const sql = userId
      ? 'SELECT * FROM provider_configurations WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM provider_configurations WHERE id = $1';
    const params = userId ? [id, userId] : [id];

    const result = await executeQuery<ProviderConfigurationRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Retrieves a provider configuration record by user ID and provider identifier.
   */
  async findByProvider(
    userId: string,
    providerId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderConfigurationRow | null> {
    const executor = getExecutor(tx);
    const sql = 'SELECT * FROM provider_configurations WHERE user_id = $1 AND provider_id = $2';
    const result = await executeQuery<ProviderConfigurationRow>(executor, sql, [userId, providerId]);
    return result.rows[0] ?? null;
  }

  /**
   * Lists all non-secret provider configurations for a user.
   */
  async listByOwner(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderConfigurationRow[]> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT * FROM provider_configurations
      WHERE user_id = $1
      ORDER BY provider_id ASC
    `;
    const result = await executeQuery<ProviderConfigurationRow>(executor, sql, [userId]);
    return result.rows;
  }

  /**
   * Creates a provider configuration metadata record (strictly non-secret metadata).
   */
  async create(
    input: CreateProviderConfigInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderConfigurationRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO provider_configurations (
        id, user_id, provider_id, selected_model_id, custom_base_url,
        is_enabled, has_credential, credential_preview
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8
      )
      RETURNING *
    `;
    const effectiveProvider = input.provider_name ?? input.provider_id ?? 'openai';
    const params = [
      input.id ?? null,
      input.user_id,
      effectiveProvider,
      input.selected_model_id ?? input.model_name ?? null,
      input.custom_base_url ?? null,
      input.is_enabled ?? true,
      input.has_credential ?? false,
      input.credential_preview ?? null,
    ];

    const result = await executeQuery<ProviderConfigurationRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create provider configuration: database returned no rows');
    }
    return row;
  }

  /**
   * Updates operational state. Supports both standard 3-arg and 5-arg legacy testing signatures.
   */
  async updateStatus(
    id: string,
    isEnabled: boolean,
    isHealthyOrUserId?: boolean | string,
    userIdOrTx?: string | TransactionContext | PoolClient,
    possibleTx?: TransactionContext | PoolClient
  ): Promise<ProviderConfigurationRow | null> {
    const tx = typeof isHealthyOrUserId === 'boolean'
      ? possibleTx ?? (typeof userIdOrTx !== 'string' ? userIdOrTx : undefined)
      : (typeof isHealthyOrUserId !== 'string' ? isHealthyOrUserId : (typeof userIdOrTx !== 'string' ? userIdOrTx : undefined));

    const executor = getExecutor(tx);

    let sql = `
      UPDATE provider_configurations
      SET is_enabled = $2,
          updated_at = NOW()
      WHERE id = $1
    `;
    const params: unknown[] = [id, isEnabled];

    if (typeof isHealthyOrUserId === 'boolean') {
      sql = `
        UPDATE provider_configurations
        SET is_enabled = $2,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $4
      `;
      params.push(isHealthyOrUserId, userIdOrTx);
    } else if (typeof isHealthyOrUserId === 'string') {
      sql += ' AND user_id = $3';
      params.push(isHealthyOrUserId);
    }
    sql += ' RETURNING *';

    const result = await executeQuery<ProviderConfigurationRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Upserts a canonical provider configuration metadata record for a user.
   */
  async upsertConfig(
    input: {
      userId: string;
      providerId: string;
      isEnabled?: boolean | undefined;
      selectedModelId?: string | null | undefined;
      customBaseUrl?: string | null | undefined;
      hasCredential?: boolean | undefined;
      credentialPreview?: string | null | undefined;
    },
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderConfigurationRow> {
    const executor = getExecutor(tx);
    const sql = `
      INSERT INTO provider_configurations (
        user_id, provider_id, is_enabled, selected_model_id, custom_base_url,
        has_credential, credential_preview, updated_at
      ) VALUES (
        $1, $2, COALESCE($3, true), $4, $5, COALESCE($6, false), $7, NOW()
      )
      ON CONFLICT (user_id, provider_id)
      DO UPDATE SET
        is_enabled = COALESCE($3, provider_configurations.is_enabled),
        selected_model_id = COALESCE($4, provider_configurations.selected_model_id),
        custom_base_url = COALESCE($5, provider_configurations.custom_base_url),
        has_credential = COALESCE($6, provider_configurations.has_credential),
        credential_preview = COALESCE($7, provider_configurations.credential_preview),
        updated_at = NOW()
      RETURNING *
    `;
    const params = [
      input.userId,
      input.providerId,
      input.isEnabled ?? null,
      input.selectedModelId ?? null,
      input.customBaseUrl ?? null,
      input.hasCredential ?? null,
      input.credentialPreview ?? null,
    ];

    const result = await executeQuery<ProviderConfigurationRow>(executor, sql, params);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to upsert provider configuration: database returned no rows');
    }
    return row;
  }

  /**
   * Updates the connection test outcome and timestamp for a specific user provider.
   */
  async updateTestStatus(
    userId: string,
    providerId: string,
    status: 'SUCCESS' | 'FAILED' | 'UNTESTED',
    testedAt: Date = new Date(),
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderConfigurationRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE provider_configurations
      SET last_connection_test_status = $3,
          last_connection_test_at = $4,
          updated_at = NOW()
      WHERE user_id = $1 AND provider_id = $2
      RETURNING *
    `;
    const result = await executeQuery<ProviderConfigurationRow>(executor, sql, [
      userId,
      providerId,
      status,
      testedAt.toISOString(),
    ]);
    return result.rows[0] ?? null;
  }

  /**
   * Deletes a provider configuration record by user ID and provider identifier.
   */
  async deleteByProvider(
    userId: string,
    providerId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<boolean> {
    const executor = getExecutor(tx);
    const sql = 'DELETE FROM provider_configurations WHERE user_id = $1 AND provider_id = $2';
    const result = await executeQuery(executor, sql, [userId, providerId]);
    return (result.rowCount ?? 0) > 0;
  }
}
