import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ICredentialService } from '../../application/ports/credential.port';

/**
 * Vault-based credential service using HashiCorp Vault's KV v2 secrets engine.
 * Stores credentials as individual secrets at a configurable path prefix.
 *
 * Required env vars:
 *   VAULT_ADDR - Vault server URL (e.g., http://127.0.0.1:8200)
 *   VAULT_TOKEN - Authentication token
 *   VAULT_MOUNT_PATH - KV v2 mount path (default: 'secret')
 *   VAULT_PATH_PREFIX - Path prefix for credentials (default: 'sqlatlas/credentials')
 */
@Injectable()
export class VaultCredentialService implements ICredentialService, OnModuleInit {
  private readonly logger = new Logger(VaultCredentialService.name);
  private vaultAddr!: string;
  private vaultToken!: string;
  private mountPath!: string;
  private pathPrefix!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.vaultAddr = this.config.getOrThrow<string>('VAULT_ADDR');
    this.vaultToken = this.config.getOrThrow<string>('VAULT_TOKEN');
    this.mountPath = this.config.get<string>('VAULT_MOUNT_PATH', 'secret');
    this.pathPrefix = this.config.get<string>('VAULT_PATH_PREFIX', 'sqlatlas/credentials');
    this.logger.log(`Vault credential service initialized: ${this.vaultAddr}`);
  }

  /**
   * Encrypt (store) a credential in Vault.
   * Returns a vault path reference that can be used to retrieve it later.
   * Format: "vault:<mount>/data/<prefix>/<uuid>"
   */
  async encrypt(plaintext: string): Promise<string> {
    const { randomUUID } = await import('crypto');
    const secretId = randomUUID();
    const secretPath = `${this.pathPrefix}/${secretId}`;
    const url = `${this.vaultAddr}/v1/${this.mountPath}/data/${secretPath}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Vault-Token': this.vaultToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { password: plaintext },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Vault write failed (${response.status}): ${body}`);
    }

    return `vault:${this.mountPath}/data/${secretPath}`;
  }

  /**
   * Decrypt (retrieve) a credential from Vault.
   * Accepts the reference string returned by encrypt().
   */
  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext.startsWith('vault:')) {
      throw new Error('Invalid vault credential reference');
    }

    const vaultPath = ciphertext.slice('vault:'.length);
    const url = `${this.vaultAddr}/v1/${vaultPath}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Vault-Token': this.vaultToken,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Vault read failed (${response.status}): ${body}`);
    }

    const json = await response.json() as { data: { data: { password: string } } };
    return json.data.data.password;
  }
}
