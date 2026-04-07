/**
 * Domain Entity: Table discovered during database analysis.
 * Tracks all tables referenced by stored procedures.
 */
export class DiscoveredTable {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly connectionId: string,
    public readonly schemaId: string,
    public readonly schemaName: string,
    public readonly tableName: string,
    public readonly fullQualifiedName: string,
    public readonly tableType: TableType,
    public readonly estimatedRowCount: number | null,
    public readonly sizeBytes: number | null,
    public readonly columns: TableColumn[],
    public readonly primaryKey: string[],
    public readonly foreignKeys: ForeignKey[],
    public readonly indexes: TableIndex[],
    public readonly referencedByCount: number,
    public readonly firstSeenAt: Date,
    public readonly lastSeenAt: Date,
    public readonly isDeleted: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get columnCount(): number {
    return this.columns.length;
  }

  get hasPrimaryKey(): boolean {
    return this.primaryKey.length > 0;
  }

  get isHeavilyReferenced(): boolean {
    return this.referencedByCount > 10;
  }

  findColumn(name: string): TableColumn | undefined {
    return this.columns.find(
      (c) => c.columnName.toLowerCase() === name.toLowerCase(),
    );
  }
}

export enum TableType {
  TABLE = 'table',
  VIEW = 'view',
  MATERIALIZED_VIEW = 'materialized_view',
  TEMP_TABLE = 'temp_table',
  EXTERNAL = 'external',
}

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
