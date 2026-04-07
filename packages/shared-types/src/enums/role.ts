export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  ANALYST = 'analyst',
  VIEWER = 'viewer',
}

export enum AuthProvider {
  LOCAL = 'local',
  OAUTH2 = 'oauth2',
  LDAP = 'ldap',
  SAML = 'saml',
}

export enum TenantPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export const PLAN_LIMITS: Record<TenantPlan, { maxConnections: number; maxUsers: number }> = {
  [TenantPlan.FREE]: { maxConnections: 2, maxUsers: 3 },
  [TenantPlan.PRO]: { maxConnections: 20, maxUsers: 50 },
  [TenantPlan.ENTERPRISE]: { maxConnections: -1, maxUsers: -1 },
};
