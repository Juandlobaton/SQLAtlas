/**
 * Domain Entity: Tenant (organization).
 * Pure class — no ORM decorators, no framework imports.
 */
export class Tenant {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly slug: string,
    public readonly plan: TenantPlan,
    public readonly settings: TenantSettings,
    public readonly maxConnections: number,
    public readonly maxUsers: number,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  canAddConnection(currentCount: number): boolean {
    if (this.maxConnections === -1) return true;
    return currentCount < this.maxConnections;
  }

  canAddUser(currentCount: number): boolean {
    if (this.maxUsers === -1) return true;
    return currentCount < this.maxUsers;
  }

  isEnterprise(): boolean {
    return this.plan === TenantPlan.ENTERPRISE;
  }
}

export enum TenantPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
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
