import { AuditLog } from '../entities/audit-log.entity';
import type { CreateAuditLog } from '../types';

export interface IAuditLogRepository {
  create(data: CreateAuditLog): Promise<AuditLog>;
  findByTenant(
    tenantId: string,
    options?: { page: number; limit: number; action?: string; userId?: string },
  ): Promise<{ items: AuditLog[]; total: number }>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('IAuditLogRepository');
