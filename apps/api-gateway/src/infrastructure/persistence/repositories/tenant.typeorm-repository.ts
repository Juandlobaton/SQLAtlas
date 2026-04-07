import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantPlan } from '../../../domain/entities/tenant.entity';
import { ITenantRepository } from '../../../domain/repositories/tenant.repository';
import { TenantOrmEntity } from '../entities/tenant.orm-entity';

@Injectable()
export class TenantTypeOrmRepository implements ITenantRepository {
  constructor(
    @InjectRepository(TenantOrmEntity)
    private readonly repo: Repository<TenantOrmEntity>,
  ) {}

  async findById(id: string): Promise<Tenant | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const entity = await this.repo.findOne({ where: { slug } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAll(): Promise<Tenant[]> {
    const entities = await this.repo.find({ order: { createdAt: 'DESC' } });
    return entities.map((e) => this.toDomain(e));
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  async create(data: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tenant> {
    const entity = this.repo.create({
      name: data.name,
      slug: data.slug,
      plan: data.plan,
      settings: data.settings as Record<string, unknown>,
      maxConnections: data.maxConnections,
      maxUsers: data.maxUsers,
      isActive: data.isActive,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    await this.repo.update(id, data as any);
    const updated = await this.repo.findOneOrFail({ where: { id } });
    return this.toDomain(updated);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toDomain(entity: TenantOrmEntity): Tenant {
    return new Tenant(
      entity.id,
      entity.name,
      entity.slug,
      entity.plan as TenantPlan,
      entity.settings as any,
      entity.maxConnections,
      entity.maxUsers,
      entity.isActive,
      entity.createdAt,
      entity.updatedAt,
    );
  }
}
