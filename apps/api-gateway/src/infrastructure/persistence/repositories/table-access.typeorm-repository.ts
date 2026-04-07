import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TableAccess, TableOperation } from '../../../domain/entities/table-access.entity';
import {
  ITableAccessRepository,
  CrudMatrixEntry,
} from '../../../domain/repositories/table-access.repository';
import { TableAccessOrmEntity } from '../entities/table-access.orm-entity';
import { ProcedureOrmEntity } from '../entities/procedure.orm-entity';

@Injectable()
export class TableAccessTypeOrmRepository implements ITableAccessRepository {
  constructor(
    @InjectRepository(TableAccessOrmEntity)
    private readonly repo: Repository<TableAccessOrmEntity>,
    @InjectRepository(ProcedureOrmEntity)
    private readonly procRepo: Repository<ProcedureOrmEntity>,
  ) {}

  async findByProcedure(procedureId: string): Promise<TableAccess[]> {
    const entities = await this.repo.find({ where: { procedureId }, order: { fullTableName: 'ASC' } });
    return entities.map((e) => this.toDomain(e));
  }

  async findByTable(tableId: string): Promise<TableAccess[]> {
    const entities = await this.repo.find({ where: { tableId }, order: { operation: 'ASC' } });
    return entities.map((e) => this.toDomain(e));
  }

  async findByConnection(connectionId: string): Promise<TableAccess[]> {
    const entities = await this.repo
      .createQueryBuilder('ta')
      .innerJoin(ProcedureOrmEntity, 'p', 'p.id = ta.procedure_id')
      .where('p.connection_id = :connectionId', { connectionId })
      .getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async getCrudMatrix(connectionId: string): Promise<CrudMatrixEntry[]> {
    const rows = await this.repo
      .createQueryBuilder('ta')
      .innerJoin(ProcedureOrmEntity, 'p', 'p.id = ta.procedure_id')
      .select([
        'ta.procedure_id AS "procedureId"',
        'p.object_name AS "procedureName"',
        'ta.table_id AS "tableId"',
        'ta.full_table_name AS "tableName"',
        'array_agg(DISTINCT ta.operation) AS "operations"',
      ])
      .where('p.connection_id = :connectionId', { connectionId })
      .groupBy('ta.procedure_id, p.object_name, ta.table_id, ta.full_table_name')
      .orderBy('p.object_name', 'ASC')
      .addOrderBy('ta.full_table_name', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      procedureId: r.procedureId,
      procedureName: r.procedureName,
      tableId: r.tableId,
      tableName: r.tableName,
      operations: r.operations || [],
      columns: [],
    }));
  }

  async bulkCreate(accesses: Omit<TableAccess, 'id' | 'createdAt'>[]): Promise<number> {
    if (accesses.length === 0) return 0;

    const entities = accesses.map((a) =>
      this.repo.create({
        tenantId: a.tenantId,
        procedureId: a.procedureId,
        tableId: a.tableId,
        tableName: a.tableName,
        fullTableName: a.fullTableName,
        operation: a.operation,
        columns: a.columns,
        lineNumber: a.lineNumber,
        isTempTable: a.isTempTable,
        isDynamic: a.isDynamic,
        confidence: a.confidence,
        analysisJobId: a.analysisJobId,
      }),
    );

    const saved = await this.repo.save(entities);
    return saved.length;
  }

  async deleteByAnalysisJob(jobId: string): Promise<number> {
    const result = await this.repo.delete({ analysisJobId: jobId });
    return result.affected ?? 0;
  }

  private toDomain(e: TableAccessOrmEntity): TableAccess {
    return new TableAccess(
      e.id, e.tenantId, e.procedureId, e.tableId, e.tableName,
      e.fullTableName, e.operation as TableOperation, e.columns,
      e.lineNumber, e.isTempTable, e.isDynamic, e.confidence,
      e.analysisJobId, e.createdAt,
    );
  }
}
