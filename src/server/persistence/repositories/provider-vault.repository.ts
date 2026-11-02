import 'server-only';
import { PoolClient } from 'pg';
import { ProviderVaultSecretRow } from '../types';
import { TransactionContext, withTransaction } from '../transaction';
import { getExecutor, executeQuery } from './base.repository';
import { EncryptedVaultPayload } from '@/server/crypto/provider-vault.crypto';

export class ProviderVaultRepository {
  /**
   * Stores an encrypted provider secret and synchronizes provider configuration metadata.
   * Executes atomically within an ACID transaction.
   */
  async storeSecret(
    userId: string,
    providerId: string,
    payload: EncryptedVaultPayload,
    credentialPreview: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderVaultSecretRow> {
    const executeInTx = async (client: PoolClient) => {
      // 1. Upsert secret in provider_vault_secrets
      const vaultSql = `
        INSERT INTO provider_vault_secrets (
          user_id, provider_id, encrypted_blob, initialization_vector, auth_tag, key_version, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id, provider_id)
        DO UPDATE SET
          encrypted_blob = EXCLUDED.encrypted_blob,
          initialization_vector = EXCLUDED.initialization_vector,
          auth_tag = EXCLUDED.auth_tag,
          key_version = EXCLUDED.key_version,
          updated_at = NOW()
        RETURNING *
      `;
      const vaultParams = [
        userId,
        providerId,
        payload.encryptedBlob,
        payload.initializationVector,
        payload.authTag,
        payload.keyVersion,
      ];
      const vaultResult = await executeQuery<ProviderVaultSecretRow>(client, vaultSql, vaultParams);
      const secretRow = vaultResult.rows[0];
      if (!secretRow) {
        throw new Error('Failed to persist provider vault secret');
      }

      // 2. Synchronize non-secret metadata in provider_configurations
      const configSql = `
        INSERT INTO provider_configurations (
          user_id, provider_id, is_enabled, has_credential, credential_preview, updated_at
        ) VALUES ($1, $2, TRUE, TRUE, $3, NOW())
        ON CONFLICT (user_id, provider_id)
        DO UPDATE SET
          has_credential = TRUE,
          credential_preview = EXCLUDED.credential_preview,
          updated_at = NOW()
      `;
      await executeQuery(client, configSql, [userId, providerId, credentialPreview]);

      return secretRow;
    };

    if (tx) {
      const client = 'client' in tx ? tx.client : tx;
      return executeInTx(client);
    }

    return withTransaction(async (transactionTx) => executeInTx(transactionTx.client));
  }

  /**
   * Retrieves an encrypted secret record for a verified user and provider.
   * Scoped strictly by user_id to enforce tenant isolation.
   */
  async getSecret(
    userId: string,
    providerId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderVaultSecretRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT * FROM provider_vault_secrets
      WHERE user_id = $1 AND provider_id = $2
    `;
    const result = await executeQuery<ProviderVaultSecretRow>(executor, sql, [userId, providerId]);
    return result.rows[0] ?? null;
  }

  /**
   * Deletes a stored secret and updates metadata in provider_configurations.
   * Atomic operation ensuring no dangling references.
   */
  async deleteSecret(
    userId: string,
    providerId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<boolean> {
    const executeInTx = async (client: PoolClient) => {
      // 1. Delete encrypted secret
      const deleteSql = `
        DELETE FROM provider_vault_secrets
        WHERE user_id = $1 AND provider_id = $2
      `;
      const deleteResult = await executeQuery(client, deleteSql, [userId, providerId]);
      const deleted = (deleteResult.rowCount ?? 0) > 0;

      // 2. Update provider configuration metadata
      const updateConfigSql = `
        UPDATE provider_configurations
        SET has_credential = FALSE,
            credential_preview = NULL,
            updated_at = NOW()
        WHERE user_id = $1 AND provider_id = $2
      `;
      await executeQuery(client, updateConfigSql, [userId, providerId]);

      return deleted;
    };

    if (tx) {
      const client = 'client' in tx ? tx.client : tx;
      return executeInTx(client);
    }

    return withTransaction(async (transactionTx) => executeInTx(transactionTx.client));
  }

  /**
   * Updates ciphertext and key version after key rotation.
   */
  async updateSecretCiphertext(
    userId: string,
    providerId: string,
    payload: EncryptedVaultPayload,
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderVaultSecretRow | null> {
    const executor = getExecutor(tx);
    const sql = `
      UPDATE provider_vault_secrets
      SET encrypted_blob = $3,
          initialization_vector = $4,
          auth_tag = $5,
          key_version = $6,
          updated_at = NOW()
      WHERE user_id = $1 AND provider_id = $2
      RETURNING *
    `;
    const params = [
      userId,
      providerId,
      payload.encryptedBlob,
      payload.initializationVector,
      payload.authTag,
      payload.keyVersion,
    ];
    const result = await executeQuery<ProviderVaultSecretRow>(executor, sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Lists all vault secrets configured by a user (metadata only, row headers).
   */
  async listSecretsForOwner(
    userId: string,
    tx?: TransactionContext | PoolClient
  ): Promise<ProviderVaultSecretRow[]> {
    const executor = getExecutor(tx);
    const sql = `
      SELECT id, user_id, provider_id, initialization_vector, auth_tag, key_version, created_at, updated_at
      FROM provider_vault_secrets
      WHERE user_id = $1
      ORDER BY provider_id ASC
    `;
    const result = await executeQuery<ProviderVaultSecretRow>(executor, sql, [userId]);
    return result.rows;
  }
}
