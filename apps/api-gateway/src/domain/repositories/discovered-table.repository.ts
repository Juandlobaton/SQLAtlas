import { DiscoveredTable } from '../entities/discovered-table.entity';
import type { CreateDiscoveredTable } from '../types';

export interface TableFilter {
  schemaId?: string; schemaName?: string; tableType?: string;
  search?: string; referencedByMin?: number;
}

export interface IDiscoveredTableRepository {
  findById(id: string): Promise<DiscoveredTable | null>;
  findByConnection(connectionId: string, filter?: TableFilter): Promise<DiscoveredTable[]>;
  findByFullName(connectionId: string, fullName: string): Promise<DiscoveredTable | null>;
  findBySchema(schemaId: string): Promise<DiscoveredTable[]>;
  getTablesAccessedByProcedure(procedureId: string): Promise<DiscoveredTable[]>;
  getProceduresAccessingTable(tableId: string): Promise<{ procedureId: string; operation: string }[]>;
  upsert(data: CreateDiscoveredTable): Promise<DiscoveredTable>;
  bulkUpsert(data: CreateDiscoveredTable[]): Promise<number>;
  delete(id: string): Promise<void>;
}

export const DISCOVERED_TABLE_REPOSITORY = Symbol('IDiscoveredTableRepository');
