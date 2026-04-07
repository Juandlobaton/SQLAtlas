import * as bcrypt from 'bcrypt';
import { IHasher } from '../../application/ports/hasher.port';

const SALT_ROUNDS = 12;

export class BcryptHasher implements IHasher {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }
}
