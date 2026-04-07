import {
  AnalyzeResult,
  BatchParseResult,
  IParsingEngine,
  ParseEngineResult,
} from '../../application/ports/parsing-engine.port';

export class HttpParsingEngine implements IParsingEngine {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async parse(sql: string, dialect: string): Promise<ParseEngineResult> {
    const response = await this.request('/api/v1/parse', {
      method: 'POST',
      body: JSON.stringify({ sql, dialect }),
    });
    return response as ParseEngineResult;
  }

  async batchParse(items: { sql: string; dialect: string }[]): Promise<BatchParseResult> {
    const response = await this.request('/api/v1/parse/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    return response as BatchParseResult;
  }

  async analyze(sql: string, dialect: string, types: string[]): Promise<AnalyzeResult> {
    const response = await this.request('/api/v1/analyze', {
      method: 'POST',
      body: JSON.stringify({ sql, dialect, analysisTypes: types }),
    });
    return response as AnalyzeResult;
  }

  async getSupportedDialects(): Promise<string[]> {
    const response = await this.request('/api/v1/dialects', { method: 'GET' });
    return (response as any).dialects;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request('/health', { method: 'GET' });
      return (response as any).status === 'healthy';
    } catch {
      return false;
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 60000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Parsing engine error ${response.status}: ${body}`);
    }

    return response.json();
  }
}
