import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { ConnectionOutput } from '../../dto/connection.dto';

export class ListConnectionsUseCase {
  constructor(private readonly connectionRepo: IConnectionRepository) {}

  async execute(tenantId: string): Promise<ConnectionOutput[]> {
    const connections = await this.connectionRepo.findByTenant(tenantId);
    return connections.map((c) => ({
      id: c.id,
      name: c.name,
      engine: c.engine,
      host: c.host,
      port: c.port,
      databaseName: c.databaseName,
      username: c.username,
      useSsl: c.useSsl,
      lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
      lastTestStatus: c.lastTestStatus,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
    }));
  }
}
