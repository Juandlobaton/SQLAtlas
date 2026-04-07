import { ForbiddenException } from '@nestjs/common';
import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { IDbConnector, ConnectionTestResult } from '../../ports/db-connector.port';
import { ICredentialService } from '../../ports/credential.port';
import { validateHost } from '../../../infrastructure/connectors/host-validator';

export class TestConnectionUseCase {
  constructor(
    private readonly connectionRepo: IConnectionRepository,
    private readonly dbConnector: IDbConnector,
    private readonly credentialService: ICredentialService,
  ) {}

  async execute(
    connectionId: string,
    password: string,
    tenantId: string,
  ): Promise<ConnectionTestResult> {
    const connection = await this.connectionRepo.findById(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (connection.tenantId !== tenantId) {
      throw new ForbiddenException('Connection not found');
    }

    validateHost(connection.host);

    const effectivePassword = password || (
      connection.encryptedPassword
        ? await this.credentialService.decrypt(connection.encryptedPassword)
        : ''
    );

    const result = await this.dbConnector.testConnection({
      engine: connection.engine,
      host: connection.host,
      port: connection.port,
      database: connection.databaseName,
      username: connection.username,
      password: effectivePassword,
      useSsl: connection.useSsl,
      sslCaCert: connection.sslCaCert ?? undefined,
      options: connection.connectionOptions,
    });

    await this.connectionRepo.updateTestStatus(
      connectionId,
      result.success ? 'success' : 'failed',
    );

    return result;
  }
}
