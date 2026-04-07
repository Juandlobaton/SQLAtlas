import { AuthTokensOutput, JwtPayload, LoginInput } from '../../dto/auth.dto';
import { IHasher } from '../../ports/hasher.port';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { ITenantRepository } from '../../../domain/repositories/tenant.repository';
import { IAuditLogRepository } from '../../../domain/repositories/audit-log.repository';

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: IAuditLogRepository,
    private readonly hasher: IHasher,
    private readonly generateTokens: (payload: JwtPayload) => AuthTokensOutput,
    private readonly multiTenant: boolean,
  ) {}

  async execute(input: LoginInput, ipAddress?: string): Promise<AuthTokensOutput> {
    const tenant = await this.resolveTenant(input.tenantSlug);
    if (!tenant || !tenant.isActive) {
      throw new AuthenticationError('Invalid credentials');
    }

    const user = await this.userRepo.findByEmail(tenant.id, input.email);
    if (!user || !user.isActive || !user.passwordHash) {
      throw new AuthenticationError('Invalid credentials');
    }

    const isValid = await this.hasher.compare(input.password, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    await this.userRepo.updateLastLogin(user.id);

    await this.auditRepo.create({
      tenantId: tenant.id,
      userId: user.id,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      details: {},
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

  private async resolveTenant(tenantSlug: string) {
    if (!this.multiTenant && !tenantSlug) {
      const tenants = await this.tenantRepo.findAll();
      return tenants[0] ?? null;
    }
    return this.tenantRepo.findBySlug(tenantSlug);
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
