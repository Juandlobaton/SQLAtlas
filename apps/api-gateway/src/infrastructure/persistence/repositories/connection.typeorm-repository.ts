import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DbConnection, DbEngine } from '../../../domain/entities/db-connection.entity';
import { IConnectionRepository } from '../../../domain/repositories/connection.repository';
import { DbConnectionOrmEntity } from '../entities/db-connection.orm-entity';
import { slugify } from '../../../shared/utils/slugify';

@Injectable()
export class ConnectionTypeOrmRepository implements IConnectionRepository {
  constructor(
    @InjectRepository(DbConnectionOrmEntity)
    private readonly repo: Repository<DbConnectionOrmEntity>,
  ) {}

  async findById(id: string): Promise<DbConnection | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByTenant(tenantId: string): Promise<DbConnection[]> {
    const entities = await this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    return entities.map((e) => this.toDomain(e));
  }

  async findAll(): Promise<DbConnection[]> {
    const entities = await this.repo.find();
    return entities.map((e) => this.toDomain(e));
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.repo.count({ where: { tenantId } });
  }

  async findByName(tenantId: string, name: string): Promise<DbConnection | null> {
    const entity = await this.repo.findOne({ where: { tenantId, name } });
    return entity ? this.toDomain(entity) : null;
  }

  async create(data: Omit<DbConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<DbConnection> {
    const entity = this.repo.create({
      tenantId: data.tenantId,
      name: data.name,
      slug: data.slug || slugify(data.name),
      engine: data.engine,
      host: data.host,
      port: data.port,
      databaseName: data.databaseName,
      username: data.username,
      vaultSecretPath: data.vaultSecretPath,
      encryptedPassword: data.encryptedPassword,
      useSsl: data.useSsl,
      sslCaCert: data.sslCaCert,
      connectionOptions: data.connectionOptions,
      lastTestedAt: data.lastTestedAt,
      lastTestStatus: data.lastTestStatus,
      isActive: data.isActive,
      createdBy: data.createdBy,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async update(id: string, data: Partial<DbConnection>): Promise<DbConnection> {
    await this.repo.update(id, data as any);
    const updated = await this.repo.findOneOrFail({ where: { id } });
    return this.toDomain(updated);
  }

  async updateTestStatus(id: string, status: 'success' | 'failed'): Promise<void> {
    await this.repo.update(id, { lastTestStatus: status, lastTestedAt: new Date() });
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toDomain(e: DbConnectionOrmEntity): DbConnection {
    return new DbConnection(
      e.id, e.tenantId, e.name, e.slug, e.engine as DbEngine, e.host, e.port,
      e.databaseName, e.username, e.vaultSecretPath, e.encryptedPassword, e.useSsl, e.sslCaCert,
      e.connectionOptions, e.lastTestedAt, e.lastTestStatus as any,
      e.isActive, e.createdBy, e.createdAt, e.updatedAt,
    );
  }
}
