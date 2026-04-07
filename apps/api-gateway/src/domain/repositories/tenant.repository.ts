import { Tenant } from '../entities/tenant.entity';
import type { CreateTenant } from '../types';

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  findAll(): Promise<Tenant[]>;
  count(): Promise<number>;
  create(data: CreateTenant): Promise<Tenant>;
  update(id: string, data: Partial<CreateTenant>): Promise<Tenant>;
  delete(id: string): Promise<void>;
}

export const TENANT_REPOSITORY = Symbol('ITenantRepository');
