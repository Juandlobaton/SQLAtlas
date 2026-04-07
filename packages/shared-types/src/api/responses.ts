export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    validationErrors?: ValidationError[];
  };
  timestamp: string;
  requestId: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    parsingEngine: ServiceHealth;
    queue: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  message?: string;
}
