import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { IAuditLogRepository } from '../../../domain/repositories/audit-log.repository';

export class DeleteConnectionUseCase {
  constructor(
    private readonly connectionRepo: IConnectionRepository,
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  async execute(connectionId: string, tenantId: string, userId: string): Promise<void> {
    const connection = await this.connectionRepo.findById(connectionId);
    if (!connection || connection.tenantId !== tenantId) {
      throw new Error('Connection not found');
    }

    await this.connectionRepo.delete(connectionId);

    await this.auditRepo.create({
      tenantId,
      userId,
      action: 'connection.delete',
      resourceType: 'connection',
      resourceId: connectionId,
      details: { name: connection.name },
      ipAddress: null,
      userAgent: null,
    });
  }
}
