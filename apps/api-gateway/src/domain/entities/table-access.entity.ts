/**
 * Domain Entity: Records how a procedure accesses a table.
 * This is the join between procedures and discovered_tables.
 */
export class TableAccess {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly procedureId: string,
    public readonly tableId: string | null,
    public readonly tableName: string,
    public readonly fullTableName: string,
    public readonly operation: TableOperation,
    public readonly columns: string[],
    public readonly lineNumber: number | null,
    public readonly isTempTable: boolean,
    public readonly isDynamic: boolean,
    public readonly confidence: number,
    public readonly analysisJobId: string | null,
    public readonly createdAt: Date,
  ) {}

  isWrite(): boolean {
    return [
      TableOperation.INSERT,
      TableOperation.UPDATE,
      TableOperation.DELETE,
      TableOperation.MERGE,
      TableOperation.TRUNCATE,
    ].includes(this.operation);
  }

  isRead(): boolean {
    return this.operation === TableOperation.SELECT;
  }
}

export enum TableOperation {
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MERGE = 'MERGE',
  TRUNCATE = 'TRUNCATE',
  EXECUTE = 'EXECUTE',
}
