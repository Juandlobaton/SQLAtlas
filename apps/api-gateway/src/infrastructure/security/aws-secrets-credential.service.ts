import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ICredentialService } from '../../application/ports/credential.port';

/**
 * AWS Secrets Manager credential service.
 * Uses the AWS SDK to store/retrieve credentials.
 *
 * Required env vars:
 *   AWS_REGION - AWS region (e.g., us-east-1)
 *   AWS_SECRET_PREFIX - Prefix for secret names (default: 'sqlatlas/credentials')
 *
 * Authentication: Uses default AWS credential chain (env vars, IAM role, etc.)
 */
@Injectable()
export class AwsSecretsCredentialService implements ICredentialService, OnModuleInit {
  private readonly logger = new Logger(AwsSecretsCredentialService.name);
  private region!: string;
  private prefix!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.region = this.config.getOrThrow<string>('AWS_REGION');
    this.prefix = this.config.get<string>('AWS_SECRET_PREFIX', 'sqlatlas/credentials');
    this.logger.log(`AWS Secrets Manager initialized: region=${this.region}, prefix=${this.prefix}`);
  }

  /**
   * Store a credential in AWS Secrets Manager.
   * Returns a reference string: "aws:<region>:<secretName>"
   */
  async encrypt(plaintext: string): Promise<string> {
    const { randomUUID } = await import('crypto');
    const secretId = randomUUID();
    const secretName = `${this.prefix}/${secretId}`;

    // Use AWS SDK v3 - dynamically imported to keep it optional
    let client: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SecretsManagerClient, CreateSecretCommand } = require('@aws-sdk/client-secrets-manager');
      client = new SecretsManagerClient({ region: this.region });
      await client.send(
        new CreateSecretCommand({
          Name: secretName,
          SecretString: plaintext,
          Description: 'SQLAtlas database credential',
        }),
      );
    } catch (err: any) {
      if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'AWS Secrets Manager requires @aws-sdk/client-secrets-manager. ' +
          'Install it with: npm install @aws-sdk/client-secrets-manager',
        );
      }
      throw err;
    }

    return `aws:${this.region}:${secretName}`;
  }

  /**
   * Retrieve a credential from AWS Secrets Manager.
   */
  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext.startsWith('aws:')) {
      throw new Error('Invalid AWS secret reference');
    }

    const parts = ciphertext.split(':');
    if (parts.length < 3) {
      throw new Error('Invalid AWS secret reference format');
    }
    const region = parts[1];
    const secretName = parts.slice(2).join(':');

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
      const client = new SecretsManagerClient({ region });
      const result = await client.send(
        new GetSecretValueCommand({ SecretId: secretName }),
      );
      if (!result.SecretString) {
        throw new Error('Secret has no string value');
      }
      return result.SecretString;
    } catch (err: any) {
      if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'AWS Secrets Manager requires @aws-sdk/client-secrets-manager. ' +
          'Install it with: npm install @aws-sdk/client-secrets-manager',
        );
      }
      throw err;
    }
  }
}
