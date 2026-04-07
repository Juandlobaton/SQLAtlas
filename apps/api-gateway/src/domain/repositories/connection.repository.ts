import { DbConnection } from '../entities/db-connection.entity';
import type { CreateDbConnection } from '../types';

export interface IConnectionRepository {
  findById(id: string): Promise<DbConnection | null>;
  findByTenant(tenantId: string): Promise<DbConnection[]>;
  findAll(): Promise<DbConnection[]>;
  countByTenant(tenantId: string): Promise<number>;
  findByName(tenantId: string, name: string): Promise<DbConnection | null>;
  create(data: CreateDbConnection): Promise<DbConnection>;
  update(id: string, data: Partial<CreateDbConnection>): Promise<DbConnection>;
  updateTestStatus(id: string, status: 'success' | 'failed'): Promise<void>;
  delete(id: string): Promise<void>;
}

export const CONNECTION_REPOSITORY = Symbol('IConnectionRepository');
