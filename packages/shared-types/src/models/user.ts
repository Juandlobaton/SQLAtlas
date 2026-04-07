import { AuthProvider, UserRole } from '../enums/role';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  authProvider: AuthProvider;
  lastLoginAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends User {
  tenantName: string;
  tenantSlug: string;
  permissions: string[];
}
