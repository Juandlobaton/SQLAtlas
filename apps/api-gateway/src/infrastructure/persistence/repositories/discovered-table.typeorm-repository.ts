import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscoveredTable, TableType } from '../../../domain/entities/discovered-table.entity';
import {
  IDiscoveredTableRepository,
  TableFilter,
} from '../../../domain/repositories/discovered-table.repository';
import { DiscoveredTableOrmEntity } from '../entities/discovered-table.orm-entity';
import { slugify } from '../../../shared/utils/slugify';
import { TableAccessOrmEntity } from '../entities/table-access.orm-entity';

@Injectable()
export class DiscoveredTableTypeOrmRepository implements IDiscoveredTableRepository {
  constructor(
    @InjectRepository(DiscoveredTableOrmEntity)
    private readonly repo: Repository<DiscoveredTableOrmEntity>,
    @InjectRepository(TableAccessOrmEntity)
    private readonly accessRepo: Repository<TableAccessOrmEntity>,
  ) {}

  async findById(id: string): Promise<DiscoveredTable | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByConnection(connectionId: string, filter?: TableFilter): Promise<DiscoveredTable[]> {
    const qb = this.repo.createQueryBuilder('t').where('t.connection_id = :connectionId', { connectionId });

    if (filter?.schemaId) qb.andWhere('t.schema_id = :schemaId', { schemaId: filter.schemaId });
    if (filter?.schemaName) qb.andWhere('t.schema_name = :schemaName', { schemaName: filter.schemaName });
    if (filter?.tableType) qb.andWhere('t.table_type = :tableType', { tableType: filter.tableType });
    if (filter?.search) qb.andWhere('t.full_qualified_name ILIKE :search', { search: `%${filter.search}%` });
    if (filter?.referencedByMin) qb.andWhere('t.referenced_by_count >= :min', { min: filter.referencedByMin });

    qb.orderBy('t.schema_name', 'ASC').addOrderBy('t.table_name', 'ASC');
    const entities = await qb.getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async findByFullName(connectionId: string, fullName: string): Promise<DiscoveredTable | null> {
    const entity = await this.repo.findOne({ where: { connectionId, fullQualifiedName: fullName } });
    return entity ? this.toDomain(entity) : null;
  }

  async findBySchema(schemaId: string): Promise<DiscoveredTable[]> {
    const entities = await this.repo.find({ where: { schemaId }, order: { tableName: 'ASC' } });
    return entities.map((e) => this.toDomain(e));
  }

  async getTablesAccessedByProcedure(procedureId: string): Promise<DiscoveredTable[]> {
    const accesses = await this.accessRepo.find({ where: { procedureId } });
    const tableIds = accesses.map((a) => a.tableId).filter(Boolean) as string[];
    if (tableIds.length === 0) return [];
    const entities = await this.repo.findByIds(tableIds);
    return entities.map((e) => this.toDomain(e));
  }

  async getProceduresAccessingTable(tableId: string): Promise<{ procedureId: string; operation: string }[]> {
    const accesses = await this.accessRepo.find({ where: { tableId } });
    return accesses.map((a) => ({ procedureId: a.procedureId, operation: a.operation }));
  }

  async upsert(data: Omit<DiscoveredTable, 'id' | 'createdAt' | 'updatedAt'>): Promise<DiscoveredTable> {
    const existing = await this.repo.findOne({
      where: { connectionId: data.connectionId, fullQualifiedName: data.fullQualifiedName },
    });

    if (existing) {
      existing.columns = data.columns as any;
      existing.primaryKey = data.primaryKey;
      existing.foreignKeys = data.foreignKeys as any;
      existing.indexes = data.indexes as any;
      existing.estimatedRowCount = data.estimatedRowCount;
      existing.sizeBytes = data.sizeBytes;
      existing.referencedByCount = data.referencedByCount;
      existing.lastSeenAt = new Date();
      existing.isDeleted = false;
      const saved = await this.repo.save(existing);
      return this.toDomain(saved);
    }

    const entity = this.repo.create({
      tenantId: data.tenantId,
      connectionId: data.connectionId,
      schemaId: data.schemaId,
      schemaName: data.schemaName,
      tableName: data.tableName,
      slug: data.slug || slugify(data.fullQualifiedName),
      fullQualifiedName: data.fullQualifiedName,
      tableType: data.tableType,
      estimatedRowCount: data.estimatedRowCount,
      sizeBytes: data.sizeBytes,
      columns: data.columns as any,
      primaryKey: data.primaryKey,
      foreignKeys: data.foreignKeys as any,
      indexes: data.indexes as any,
      referencedByCount: data.referencedByCount,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async bulkUpsert(tables: Omit<DiscoveredTable, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<number> {
    let count = 0;
    for (const table of tables) {
      await this.upsert(table);
      count++;
    }
    return count;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toDomain(e: DiscoveredTableOrmEntity): DiscoveredTable {
    return new DiscoveredTable(
      e.id, e.tenantId, e.connectionId, e.schemaId, e.schemaName,
      e.tableName, e.slug, e.fullQualifiedName, e.tableType as TableType,
      e.estimatedRowCount, e.sizeBytes, e.columns as any, e.primaryKey,
      e.foreignKeys as any, e.indexes as any, e.referencedByCount,
      e.firstSeenAt, e.lastSeenAt, e.isDeleted, e.createdAt, e.updatedAt,
    );
  }
}
