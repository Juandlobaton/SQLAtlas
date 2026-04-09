const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';
const PARSER_BASE = import.meta.env.VITE_PARSER_BASE || '/parse';
const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// Prevent concurrent refresh requests
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => { refreshPromise = null; });

  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(base: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, signal, ...rest } = options;

  // Demo mode: intercept ALL API calls with mock data
  if (IS_DEMO) {
    const { demoFetch } = await import('@/demo/demo-api');
    const fullPath = base === PARSER_BASE ? `/parser${path}` : path;
    const response = await demoFetch(fullPath, {
      ...rest,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders as Record<string, string>,
  };

  let response = await fetch(`${base}${path}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
    credentials: 'include',
  });

  // On 401, attempt to refresh the access token and retry once
  if (response.status === 401 && !IS_DEMO && !path.includes('/auth/')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      response = await fetch(`${base}${path}`, {
        ...rest,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
        credentials: 'include',
      });
    }
  }

  // If still 401 after refresh attempt, logout (skip for auth endpoints — they handle their own errors)
  if (response.status === 401 && !IS_DEMO && !path.includes('/auth/')) {
    fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new ApiError(response.status, error.error?.message || error.message || 'Request failed', error.error?.code);
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  get: <T>(path: string) => request<T>(API_BASE, path),
  post: <T>(path: string, body?: unknown) => request<T>(API_BASE, path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(API_BASE, path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(API_BASE, path, { method: 'DELETE' }),
};

export const parserApi = {
  parse: (sql: string, dialect: string, signal?: AbortSignal) =>
    request<ParseResponse>(PARSER_BASE, '/api/v1/parse', {
      method: 'POST',
      body: { sql, dialect },
      signal,
    }),
  analyze: (sql: string, dialect: string, analysisTypes?: string[]) =>
    request<AnalyzeResponse>(PARSER_BASE, '/api/v1/analyze', {
      method: 'POST',
      body: { sql, dialect, analysisTypes },
    }),
  dialects: () => request<{ dialects: string[] }>(PARSER_BASE, '/api/v1/dialects'),
  health: () => request<{ status: string }>(PARSER_BASE, '/health'),
};

export interface ParseResponse {
  success: boolean;
  data: Record<string, unknown>[];
  errors: string[];
  metadata: Record<string, unknown>;
}

interface AnalyzeResponse {
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
