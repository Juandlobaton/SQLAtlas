import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, AuthProvider } from '../../../domain/entities/user.entity';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { UserOrmEntity } from '../entities/user.orm-entity';

@Injectable()
export class UserTypeOrmRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repo: Repository<UserOrmEntity>,
  ) {}

  async findById(id: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { tenantId, email } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByExternalId(tenantId: string, externalId: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { tenantId, externalId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByTenant(tenantId: string): Promise<User[]> {
    const entities = await this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.repo.count({ where: { tenantId } });
  }

  async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const entity = this.repo.create({
      tenantId: data.tenantId,
      email: data.email,
      displayName: data.displayName,
      passwordHash: data.passwordHash,
      avatarUrl: data.avatarUrl,
      role: data.role,
      authProvider: data.authProvider,
      externalId: data.externalId,
      lastLoginAt: data.lastLoginAt,
      isActive: data.isActive,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.repo.update(id, data as any);
    const updated = await this.repo.findOneOrFail({ where: { id } });
    return this.toDomain(updated);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toDomain(entity: UserOrmEntity): User {
    return new User(
      entity.id,
      entity.tenantId,
      entity.email,
      entity.displayName,
      entity.passwordHash,
      entity.avatarUrl,
      entity.role as UserRole,
      entity.authProvider as AuthProvider,
      entity.externalId,
      entity.lastLoginAt,
      entity.isActive,
      entity.createdAt,
      entity.updatedAt,
    );
  }
}
