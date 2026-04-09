import { CreateConnectionInput, ConnectionOutput } from '../../dto/connection.dto';
import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { ITenantRepository } from '../../../domain/repositories/tenant.repository';
import { IAuditLogRepository } from '../../../domain/repositories/audit-log.repository';
import { ICredentialService } from '../../ports/credential.port';
import { DbEngine } from '../../../domain/entities/db-connection.entity';
import { validateHost } from '../../../infrastructure/connectors/host-validator';
import { slugify } from '../../../shared/utils/slugify';

export class CreateConnectionUseCase {
  constructor(
    private readonly connectionRepo: IConnectionRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: IAuditLogRepository,
    private readonly credentialService: ICredentialService,
  ) {}

  async execute(input: CreateConnectionInput): Promise<ConnectionOutput> {
    const tenant = await this.tenantRepo.findById(input.tenantId);
    if (!tenant) {
      throw new ConnectionError('Tenant not found');
    }

    const currentCount = await this.connectionRepo.countByTenant(input.tenantId);
    if (!tenant.canAddConnection(currentCount)) {
      throw new ConnectionError(
        `Connection limit reached (${tenant.maxConnections}). Upgrade your plan.`,
      );
    }

    const existing = await this.connectionRepo.findByName(input.tenantId, input.name);
    if (existing) {
      throw new ConnectionError(`Connection "${input.name}" already exists`);
    }

    validateHost(input.host);

    if (!Object.values(DbEngine).includes(input.engine as DbEngine)) {
      throw new ConnectionError(`Unsupported engine: ${input.engine}`);
    }

    const encryptedPassword = input.password
      ? await this.credentialService.encrypt(input.password)
      : null;

    const connection = await this.connectionRepo.create({
      tenantId: input.tenantId,
      name: input.name,
      slug: slugify(input.name),
      engine: input.engine as DbEngine,
      host: input.host,
      port: input.port,
      databaseName: input.databaseName,
      username: input.username,
      encryptedPassword,
      vaultSecretPath: null,
      useSsl: input.useSsl ?? true,
      sslCaCert: null,
      connectionOptions: (input.connectionOptions ?? {}) as Record<string, unknown>,
      lastTestedAt: null,
      lastTestStatus: null,
      isActive: true,
      createdBy: input.createdBy,
    });

    await this.auditRepo.create({
      tenantId: input.tenantId,
      userId: input.createdBy,
      action: 'connection.create',
      resourceType: 'connection',
      resourceId: connection.id,
      details: { name: input.name, engine: input.engine },
      ipAddress: null,
      userAgent: null,
    });

    return this.toOutput(connection);
  }

  private toOutput(conn: any): ConnectionOutput {
    return {
      id: conn.id,
      name: conn.name,
      engine: conn.engine,
      host: conn.host,
      port: conn.port,
      databaseName: conn.databaseName,
      username: conn.username,
      useSsl: conn.useSsl,
      lastTestedAt: conn.lastTestedAt?.toISOString() ?? null,
      lastTestStatus: conn.lastTestStatus,
      isActive: conn.isActive,
      createdAt: conn.createdAt.toISOString(),
    };
  }
}

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}
