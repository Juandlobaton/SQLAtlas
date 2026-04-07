/**
 * Application Port: Password hashing contract.
 */
export interface IHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hashed: string): Promise<boolean>;
}

export const HASHER = Symbol('IHasher');
