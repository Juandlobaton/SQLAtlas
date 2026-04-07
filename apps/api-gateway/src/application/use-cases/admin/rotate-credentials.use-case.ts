import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { ICredentialService } from '../../ports/credential.port';

export interface RotateResult {
  total: number;
  rotated: number;
  skipped: number;
  errors: string[];
}

export class RotateCredentialsUseCase {
  constructor(
    private readonly connRepo: IConnectionRepository,
    private readonly credService: ICredentialService & { needsReEncrypt?: (c: string) => Promise<boolean> },
  ) {}

  async execute(): Promise<RotateResult> {
    const connections = await this.connRepo.findAll();
    const result: RotateResult = { total: connections.length, rotated: 0, skipped: 0, errors: [] };

    for (const conn of connections) {
      if (!conn.encryptedPassword) {
        result.skipped++;
        continue;
      }

      try {
        const needs = this.credService.needsReEncrypt
          ? await this.credService.needsReEncrypt(conn.encryptedPassword)
          : false;

        if (!needs) {
          result.skipped++;
          continue;
        }

        // Decrypt with old key, re-encrypt with new key
        const plaintext = await this.credService.decrypt(conn.encryptedPassword);
        const reEncrypted = await this.credService.encrypt(plaintext);
        await this.connRepo.update(conn.id, { encryptedPassword: reEncrypted });
        result.rotated++;
      } catch (err: any) {
        result.errors.push(`${conn.name} (${conn.id}): ${err.message}`);
      }
    }

    return result;
  }
}
