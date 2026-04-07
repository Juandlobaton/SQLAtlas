export interface LoginInput {
  email: string;
  password: string;
  tenantSlug: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  tenantName: string;
}

export interface AuthTokensOutput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SetupInput {
  email: string;
  password: string;
  displayName: string;
  orgName: string;
}

export interface SystemStatusOutput {
  needsSetup: boolean;
  registrationMode: 'closed' | 'invite-only' | 'open';
  multiTenant: boolean;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}
