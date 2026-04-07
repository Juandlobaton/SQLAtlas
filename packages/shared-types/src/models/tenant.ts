import { TenantPlan } from '../enums/role';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  settings: TenantSettings;
  maxConnections: number;
  maxUsers: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  defaultTheme?: 'light' | 'dark';
  allowedAuthProviders?: string[];
  dataRetentionDays?: number;
  enableAuditLog?: boolean;
  customBranding?: {
    logoUrl?: string;
    primaryColor?: string;
    companyName?: string;
  };
}
