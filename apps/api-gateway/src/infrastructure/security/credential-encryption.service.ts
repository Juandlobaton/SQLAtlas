import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ICredentialService } from '../../application/ports/credential.port';

@Injectable()
export class CredentialEncryptionService implements ICredentialService, OnModuleInit {
  private key!: Buffer;
  private previousKey: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.key = this.parseKey('CREDENTIAL_ENCRYPTION_KEY', true);
    const prevKeyHex = this.config.get<string>('CREDENTIAL_ENCRYPTION_KEY_PREVIOUS');
    if (prevKeyHex) {
      this.previousKey = this.parseKey('CREDENTIAL_ENCRYPTION_KEY_PREVIOUS', false);
      console.log('Key rotation: previous encryption key loaded. Credentials will be re-encrypted on access.');
    }
  }

  private parseKey(envVar: string, required: boolean): Buffer {
    const keyHex = this.config.get<string>(envVar);
    if (!keyHex) {
      if (required) {
        throw new Error(
          `${envVar} environment variable is required. ` +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
        );
      }
      return Buffer.alloc(0);
    }
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
      throw new Error(`${envVar} must be exactly 32 bytes (64 hex characters)`);
    }
    return key;
  }

  async encrypt(plaintext: string): Promise<string> {
    return this.encryptWithKey(plaintext, this.key);
  }

  async decrypt(ciphertext: string): Promise<string> {
    // Try current key first
    try {
      return this.decryptWithKey(ciphertext, this.key);
    } catch {
      // If we have a previous key, try that
      if (this.previousKey && this.previousKey.length === 32) {
        try {
          const plaintext = this.decryptWithKey(ciphertext, this.previousKey);
          // Re-encryption happens at the caller level (use case) since we don't
          // have write access to the repository here. The caller should detect
          // this via needsReEncrypt() and update the stored credential.
          return plaintext;
        } catch {
          throw new Error('Failed to decrypt credential with current or previous key');
        }
      }
      throw new Error('Failed to decrypt credential');
    }
  }

  /**
   * Check if a ciphertext was encrypted with the previous key (needs re-encryption).
   * Returns true if decrypt with current key fails but previous key succeeds.
   */
  async needsReEncrypt(ciphertext: string): Promise<boolean> {
    if (!this.previousKey || this.previousKey.length !== 32) return false;
    try {
      this.decryptWithKey(ciphertext, this.key);
      return false; // Current key works fine
    } catch {
      try {
        this.decryptWithKey(ciphertext, this.previousKey);
        return true; // Previous key works — needs re-encryption
      } catch {
        return false; // Neither key works
      }
    }
  }

  private encryptWithKey(plaintext: string, key: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  private decryptWithKey(ciphertext: string, key: Buffer): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted credential format');
    }
    const [ivB64, authTagB64, encryptedB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
