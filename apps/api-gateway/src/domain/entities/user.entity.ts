/**
 * Domain Entity: User.
 * Pure class — no framework dependencies.
 */
export class User {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly email: string,
    public readonly displayName: string,
    public readonly passwordHash: string | null,
    public readonly avatarUrl: string | null,
    public readonly role: UserRole,
    public readonly authProvider: AuthProvider,
    public readonly externalId: string | null,
    public readonly lastLoginAt: Date | null,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isAdmin(): boolean {
    return this.role === UserRole.OWNER || this.role === UserRole.ADMIN;
  }

  canManageUsers(): boolean {
    return this.role === UserRole.OWNER || this.role === UserRole.ADMIN;
  }

  canAnalyze(): boolean {
    return this.role !== UserRole.VIEWER;
  }

  canWrite(): boolean {
    return this.role !== UserRole.VIEWER;
  }

  hasPermission(permission: string): boolean {
    return ROLE_PERMISSIONS[this.role]?.includes(permission) ?? false;
  }
}

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

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.OWNER]: [
    'tenant:manage',
    'users:manage',
    'connections:manage',
    'analysis:execute',
    'analysis:read',
    'annotations:write',
    'annotations:read',
    'export:execute',
    'audit:read',
  ],
  [UserRole.ADMIN]: [
    'users:manage',
    'connections:manage',
    'analysis:execute',
    'analysis:read',
    'annotations:write',
    'annotations:read',
    'export:execute',
    'audit:read',
  ],
  [UserRole.ANALYST]: [
    'connections:read',
    'analysis:execute',
    'analysis:read',
    'annotations:write',
    'annotations:read',
    'export:execute',
  ],
  [UserRole.VIEWER]: ['connections:read', 'analysis:read', 'annotations:read'],
};
