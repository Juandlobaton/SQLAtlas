/**
 * Application Port: Parsing Engine client contract.
 * Infrastructure implements this with HTTP calls to the Python service.
 */
export interface IParsingEngine {
  parse(sql: string, dialect: string): Promise<ParseEngineResult>;
  batchParse(items: { sql: string; dialect: string }[]): Promise<BatchParseResult>;
  analyze(sql: string, dialect: string, types: string[]): Promise<AnalyzeResult>;
  getSupportedDialects(): Promise<string[]>;
  healthCheck(): Promise<boolean>;
}

export interface ParseEngineResult {
  success: boolean;
  data: Record<string, unknown>[];
  errors: string[];
  metadata: Record<string, unknown>;
}

export interface BatchParseResult {
  success: boolean;
  totalProcessed: number;
  totalErrors: number;
  results: ParseEngineResult[];
}

export interface AnalyzeResult {
  success: boolean;
  data: {
    dependencies: Record<string, unknown>[];
    tableReferences: Record<string, unknown>[];
    securityFindings: Record<string, unknown>[];
    complexity: Record<string, unknown> | null;
    flowTree: Record<string, unknown> | null;
  };
  errors: string[];
}

export const PARSING_ENGINE = Symbol('IParsingEngine');
