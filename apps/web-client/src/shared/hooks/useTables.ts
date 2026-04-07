import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api-client';

type ApiResponse<T> = { success: boolean; data: T };

export interface TableColumn {
  columnName: string;
  dataType: string;
  ordinalPosition: number;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  maxLength: number | null;
  precision: number | null;
  scale: number | null;
  description: string | null;
}

export interface ForeignKey {
  constraintName: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface TableIndex {
  indexName: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  indexType: string;
}

export interface TableItem {
  id: string;
  schemaName: string;
  tableName: string;
  fullQualifiedName: string;
  tableType: string;
  estimatedRowCount: number | null;
  columnCount: number;
  columns: TableColumn[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
  indexes: TableIndex[];
  referencedByCount: number;
}

export interface TableDetailResponse {
  table: TableItem | null;
  accessedBy: { procedureId: string; operation: string }[];
}

export interface ERTable {
  id: string;
  schemaName: string;
  tableName: string;
  fullQualifiedName: string;
  columns: { name: string; type: string; isPK: boolean; isFK: boolean; isNullable: boolean }[];
  estimatedRowCount: number | null;
}

export interface ERRelationship {
  id: string;
  constraintName: string;
  sourceTableId: string;
  sourceColumns: string[];
  targetTableId: string;
  targetColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface ERDiagramData {
  tables: ERTable[];
  relationships: ERRelationship[];
}

export function useTables(connectionId: string | null, filter?: { schema?: string; search?: string; type?: string }) {
  const params = new URLSearchParams();
  if (filter?.schema) params.set('schema', filter.schema);
  if (filter?.search) params.set('search', filter.search);
  if (filter?.type) params.set('type', filter.type);
  const qs = params.toString();

  return useQuery({
    queryKey: ['tables', connectionId, qs],
    queryFn: () => api.get<ApiResponse<TableItem[]>>(`/analysis/tables/${connectionId}${qs ? `?${qs}` : ''}`).then(r => r.data),
    enabled: !!connectionId,
  });
}

export function useTableDetail(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: ['table-detail', tableId],
    queryFn: () => api.get<ApiResponse<TableDetailResponse>>(`/analysis/tables/${connectionId}/${tableId}`).then(r => r.data),
    enabled: !!connectionId && !!tableId,
  });
}

export function useERDiagram(connectionId: string | null, schema?: string) {
  return useQuery({
    queryKey: ['er-diagram', connectionId, schema],
    queryFn: () => api.get<ApiResponse<ERDiagramData>>(`/analysis/er-diagram/${connectionId}${schema ? `?schema=${schema}` : ''}`).then(r => r.data),
    enabled: !!connectionId,
  });
}
