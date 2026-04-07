export interface ICredentialService {
  /**
   * Encrypt a plaintext credential for storage.
   * Returns an opaque string (format depends on implementation).
   */
  encrypt(plaintext: string): Promise<string>;

  /**
   * Decrypt a stored credential back to plaintext.
   * Accepts the opaque string returned by encrypt().
   */
  decrypt(ciphertext: string): Promise<string>;
}

export const CREDENTIAL_SERVICE = Symbol('ICredentialService');
