import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DiscoveredSchema } from '../../../domain/entities/discovered-schema.entity';
import { IDiscoveredSchemaRepository } from '../../../domain/repositories/discovered-schema.repository';
import { DiscoveredSchemaOrmEntity } from '../entities/discovered-schema.orm-entity';
import { slugify } from '../../../shared/utils/slugify';

@Injectable()
export class DiscoveredSchemaTypeOrmRepository implements IDiscoveredSchemaRepository {
  constructor(
    @InjectRepository(DiscoveredSchemaOrmEntity)
    private readonly repo: Repository<DiscoveredSchemaOrmEntity>,
  ) {}

  async findById(id: string): Promise<DiscoveredSchema | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByConnection(connectionId: string): Promise<DiscoveredSchema[]> {
    const entities = await this.repo.find({ where: { connectionId }, order: { schemaName: 'ASC' } });
    return entities.map((e) => this.toDomain(e));
  }

  async findByName(
    connectionId: string,
    schemaName: string,
    catalogName?: string,
  ): Promise<DiscoveredSchema | null> {
    const where: Record<string, unknown> = { connectionId, schemaName };
    if (catalogName) where.catalogName = catalogName;
    const entity = await this.repo.findOne({ where });
    return entity ? this.toDomain(entity) : null;
  }

  async upsert(data: Omit<DiscoveredSchema, 'id' | 'createdAt'>): Promise<DiscoveredSchema> {
    const existing = await this.repo.findOne({
      where: {
        connectionId: data.connectionId,
        schemaName: data.schemaName,
        catalogName: data.catalogName ?? IsNull(),
      },
    });

    if (existing) {
      existing.objectCounts = data.objectCounts as any;
      existing.sizeBytes = data.sizeBytes;
      existing.owner = data.owner;
      existing.lastSeenAt = new Date();
      const saved = await this.repo.save(existing);
      return this.toDomain(saved);
    }

    const entity = this.repo.create({
      tenantId: data.tenantId,
      connectionId: data.connectionId,
      schemaName: data.schemaName,
      slug: data.slug || slugify(data.schemaName),
      catalogName: data.catalogName,
      objectCounts: data.objectCounts as any,
      sizeBytes: data.sizeBytes,
      owner: data.owner,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async bulkUpsert(schemas: Omit<DiscoveredSchema, 'id' | 'createdAt'>[]): Promise<number> {
    let count = 0;
    for (const schema of schemas) {
      await this.upsert(schema);
      count++;
    }
    return count;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toDomain(e: DiscoveredSchemaOrmEntity): DiscoveredSchema {
    return new DiscoveredSchema(
      e.id, e.tenantId, e.connectionId, e.schemaName, e.slug, e.catalogName,
      e.objectCounts as any, e.sizeBytes, e.owner,
      e.firstSeenAt, e.lastSeenAt, e.createdAt,
    );
  }
}
