import { TableAccess } from '../entities/table-access.entity';
import type { CreateTableAccess } from '../types';

export interface ITableAccessRepository {
  findByProcedure(procedureId: string): Promise<TableAccess[]>;
  findByTable(tableId: string): Promise<TableAccess[]>;
  findByConnection(connectionId: string): Promise<TableAccess[]>;
  getCrudMatrix(connectionId: string): Promise<CrudMatrixEntry[]>;
  bulkCreate(data: CreateTableAccess[]): Promise<number>;
  deleteByAnalysisJob(jobId: string): Promise<number>;
}

export interface CrudMatrixEntry {
  procedureId: string; procedureName: string; tableId: string;
  tableName: string; operations: string[]; columns: string[];
}

export const TABLE_ACCESS_REPOSITORY = Symbol('ITableAccessRepository');
