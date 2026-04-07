import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../../domain/entities/audit-log.entity';
import { IAuditLogRepository } from '../../../domain/repositories/audit-log.repository';
import { AuditLogOrmEntity } from '../entities/audit-log.orm-entity';

@Injectable()
export class AuditLogTypeOrmRepository implements IAuditLogRepository {
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    private readonly repo: Repository<AuditLogOrmEntity>,
  ) {}

  async create(data: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const entity = this.repo.create({
      tenantId: data.tenantId,
      userId: data.userId,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      details: data.details,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async findByTenant(
    tenantId: string,
    options?: { page: number; limit: number; action?: string; userId?: string },
  ): Promise<{ items: AuditLog[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;

    const qb = this.repo.createQueryBuilder('log').where('log.tenant_id = :tenantId', { tenantId });

    if (options?.action) qb.andWhere('log.action = :action', { action: options.action });
    if (options?.userId) qb.andWhere('log.user_id = :userId', { userId: options.userId });

    qb.orderBy('log.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [entities, total] = await qb.getManyAndCount();
    return { items: entities.map((e) => this.toDomain(e)), total };
  }

  private toDomain(entity: AuditLogOrmEntity): AuditLog {
    return new AuditLog(
      entity.id,
      entity.tenantId,
      entity.userId,
      entity.action,
      entity.resourceType,
      entity.resourceId,
      entity.details,
      entity.ipAddress,
      entity.userAgent,
      entity.createdAt,
    );
  }
}
