export enum AnalysisStatus {
  PENDING = 'pending',
  EXTRACTING = 'extracting',
  PARSING = 'parsing',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum DependencyType {
  CALLS = 'calls',
  READS_FROM = 'reads_from',
  WRITES_TO = 'writes_to',
  REFERENCES = 'references',
}

export enum ObjectType {
  PROCEDURE = 'procedure',
  FUNCTION = 'function',
  TRIGGER = 'trigger',
  VIEW = 'view',
  PACKAGE = 'package',
}

export enum TableOperation {
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MERGE = 'MERGE',
  TRUNCATE = 'TRUNCATE',
}

export enum SecuritySeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}
