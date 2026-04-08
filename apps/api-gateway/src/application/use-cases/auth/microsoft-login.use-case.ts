import { AuthTokensOutput, JwtPayload } from '../../dto/auth.dto';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { ITenantRepository } from '../../../domain/repositories/tenant.repository';
import { IAuditLogRepository } from '../../../domain/repositories/audit-log.repository';
import { AuthProvider, UserRole } from '../../../domain/entities/user.entity';

export interface MicrosoftProfile {
  /** Azure AD object ID (oid claim) */
  oid: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

export class MicrosoftLoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: IAuditLogRepository,
    private readonly generateTokens: (payload: JwtPayload) => AuthTokensOutput,
    private readonly multiTenant: boolean,
    private readonly autoProvision: boolean,
    private readonly defaultRole: UserRole,
  ) {}

  async execute(profile: MicrosoftProfile, tenantSlug?: string, ipAddress?: string): Promise<AuthTokensOutput> {
    const tenant = await this.resolveTenant(tenantSlug);
    if (!tenant || !tenant.isActive) {
      throw new MicrosoftLoginError('Organization not found or inactive');
    }

    // 1. Look up by externalId (Azure OID)
    let user = await this.userRepo.findByExternalId(tenant.id, profile.oid);

    // 2. Fallback: look up by email (linking existing local account)
    if (!user) {
      user = await this.userRepo.findByEmail(tenant.id, profile.email);
      if (user && user.authProvider === AuthProvider.LOCAL) {
        // Link existing local account to Microsoft — update externalId and provider
        user = await this.userRepo.update(user.id, {
          authProvider: AuthProvider.OAUTH2,
          externalId: profile.oid,
          avatarUrl: profile.avatarUrl ?? user.avatarUrl,
        });
      }
    }

    // 3. JIT provision if enabled and user not found
    if (!user && this.autoProvision) {
      user = await this.userRepo.create({
        tenantId: tenant.id,
        email: profile.email,
        displayName: profile.displayName,
        passwordHash: null,
        avatarUrl: profile.avatarUrl ?? null,
        role: this.defaultRole,
        authProvider: AuthProvider.OAUTH2,
        externalId: profile.oid,
        lastLoginAt: new Date(),
        isActive: true,
      });
    }

    if (!user || !user.isActive) {
      throw new MicrosoftLoginError('User not authorized. Contact your administrator.');
    }

    await this.userRepo.updateLastLogin(user.id);

    await this.auditRepo.create({
      tenantId: tenant.id,
      userId: user.id,
      action: 'auth.login.microsoft',
      resourceType: 'user',
      resourceId: user.id,
      details: { provider: 'microsoft', externalId: profile.oid },
      ipAddress: ipAddress ?? null,
      userAgent: null,
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role,
    };

    return this.generateTokens(payload);
  }

  private async resolveTenant(tenantSlug?: string) {
    if (!this.multiTenant && !tenantSlug) {
      const tenants = await this.tenantRepo.findAll();
      return tenants[0] ?? null;
    }
    return tenantSlug ? this.tenantRepo.findBySlug(tenantSlug) : null;
  }
}

export class MicrosoftLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MicrosoftLoginError';
  }
}
