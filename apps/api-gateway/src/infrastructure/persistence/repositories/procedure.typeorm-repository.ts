import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Procedure, ObjectType } from '../../../domain/entities/procedure.entity';
import {
  IProcedureRepository,
  ProcedureFilter,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/repositories/procedure.repository';
import { ProcedureOrmEntity } from '../entities/procedure.orm-entity';

const CHUNK_SIZE = 50;

@Injectable()
export class ProcedureTypeOrmRepository implements IProcedureRepository {
  constructor(
    @InjectRepository(ProcedureOrmEntity)
    private readonly repo: Repository<ProcedureOrmEntity>,
  ) {}

  async findById(id: string): Promise<Procedure | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByConnection(
    tenantId: string,
    connectionId: string,
    filter?: ProcedureFilter,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Procedure>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 50;

    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.connection_id = :connectionId', { connectionId })
      .andWhere('p.is_deleted = false');

    if (filter?.schemaName) qb.andWhere('p.schema_name = :schema', { schema: filter.schemaName });
    if (filter?.objectType) qb.andWhere('p.object_type = :type', { type: filter.objectType });
    if (filter?.search) {
      qb.andWhere('(p.object_name ILIKE :search OR p.full_qualified_name ILIKE :search)', {
        search: `%${filter.search}%`,
      });
    }
    if (filter?.hasSecurityIssues) {
      qb.andWhere("p.security_findings::text != '[]'");
    }

    const ALLOWED_SORT_COLUMNS = ['objectName', 'schemaName', 'createdAt', 'lineCount', 'estimatedComplexity', 'objectType'];
    const requestedSort = pagination?.sortBy ?? '';
    const sortBy = ALLOWED_SORT_COLUMNS.includes(requestedSort) ? requestedSort : 'objectName';
    const sortOrder = (pagination?.sortOrder?.toUpperCase() as 'ASC' | 'DESC') || 'ASC';
    qb.orderBy(`p.${this.toSnakeCase(sortBy)}`, sortOrder);

    qb.skip((page - 1) * limit).take(limit);
    const [entities, total] = await qb.getManyAndCount();

    return {
      items: entities.map((e) => this.toDomain(e)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByHash(connectionId: string, hash: string): Promise<Procedure | null> {
    const entity = await this.repo.findOne({ where: { connectionId, definitionHash: hash } });
    return entity ? this.toDomain(entity) : null;
  }

  async upsert(data: Omit<Procedure, 'id' | 'createdAt' | 'updatedAt'>): Promise<Procedure> {
    const existing = await this.repo.findOne({
      where: { connectionId: data.connectionId, fullQualifiedName: data.fullQualifiedName },
    });

    if (existing) {
      existing.rawDefinition = data.rawDefinition;
      existing.definitionHash = data.definitionHash;
      existing.parameters = data.parameters as any;
      existing.returnType = data.returnType;
      existing.estimatedComplexity = data.estimatedComplexity;
      existing.lineCount = data.lineCount;
      existing.autoDoc = data.autoDoc;
      existing.securityFindings = data.securityFindings as any;
      existing.lastSeenAt = new Date();
      existing.isDeleted = false;
      const saved = await this.repo.save(existing);
      return this.toDomain(saved);
    }

    const entity = this.repo.create({
      tenantId: data.tenantId,
      connectionId: data.connectionId,
      schemaId: data.schemaId,
      analysisJobId: data.analysisJobId,
      objectType: data.objectType,
      schemaName: data.schemaName,
      objectName: data.objectName,
      fullQualifiedName: data.fullQualifiedName,
      rawDefinition: data.rawDefinition,
      definitionHash: data.definitionHash,
      language: data.language,
      parameters: data.parameters as any,
      returnType: data.returnType,
      isDeterministic: data.isDeterministic,
      estimatedComplexity: data.estimatedComplexity,
      lineCount: data.lineCount,
      autoDoc: data.autoDoc,
      securityFindings: data.securityFindings as any,
      sourceCreatedAt: data.sourceCreatedAt,
      sourceModifiedAt: data.sourceModifiedAt,
    });
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async bulkUpsert(procedures: Omit<Procedure, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<number> {
    let count = 0;
    for (let i = 0; i < procedures.length; i += CHUNK_SIZE) {
      const chunk = procedures.slice(i, i + CHUNK_SIZE);
      for (const proc of chunk) {
        await this.upsert(proc);
        count++;
      }
    }
    return count;
  }

  async markDeleted(connectionId: string, excludeIds: string[]): Promise<number> {
    const qb = this.repo
      .createQueryBuilder()
      .update()
      .set({ isDeleted: true })
      .where('connection_id = :connectionId', { connectionId })
      .andWhere('is_deleted = false');

    if (excludeIds.length > 0) {
      qb.andWhere('id NOT IN (:...excludeIds)', { excludeIds });
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  }

  private toDomain(e: ProcedureOrmEntity): Procedure {
    return new Procedure(
      e.id, e.tenantId, e.connectionId, e.schemaId, e.analysisJobId,
      e.objectType as ObjectType, e.schemaName, e.objectName, e.fullQualifiedName,
      e.rawDefinition, e.definitionHash, e.language, e.parameters as any,
      e.returnType, e.isDeterministic, e.estimatedComplexity, e.lineCount,
      e.autoDoc, e.securityFindings as any, e.sourceCreatedAt, e.sourceModifiedAt,
      e.firstSeenAt, e.lastSeenAt, e.isDeleted, e.createdAt, e.updatedAt,
    );
  }
}
