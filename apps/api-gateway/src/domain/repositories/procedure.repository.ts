import { Procedure } from '../entities/procedure.entity';
import type { CreateProcedure } from '../types';

export interface ProcedureFilter {
  connectionId?: string;
  schemaName?: string;
  objectType?: string;
  search?: string;
  hasSecurityIssues?: boolean;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IProcedureRepository {
  findById(id: string): Promise<Procedure | null>;
  findByConnection(tenantId: string, connectionId: string, filter?: ProcedureFilter, pagination?: PaginationOptions): Promise<PaginatedResult<Procedure>>;
  findByHash(connectionId: string, hash: string): Promise<Procedure | null>;
  upsert(data: CreateProcedure): Promise<Procedure>;
  bulkUpsert(data: CreateProcedure[]): Promise<number>;
  markDeleted(connectionId: string, excludeIds: string[]): Promise<number>;
  delete(id: string): Promise<void>;
}

export const PROCEDURE_REPOSITORY = Symbol('IProcedureRepository');
