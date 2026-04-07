import { User } from '../entities/user.entity';
import type { CreateUser } from '../types';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(tenantId: string, email: string): Promise<User | null>;
  findByTenant(tenantId: string): Promise<User[]>;
  countByTenant(tenantId: string): Promise<number>;
  create(data: CreateUser): Promise<User>;
  update(id: string, data: Partial<CreateUser>): Promise<User>;
  updateLastLogin(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
