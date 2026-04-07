import { AuthTokensOutput, JwtPayload, SetupInput } from '../../dto/auth.dto';
import { IHasher } from '../../ports/hasher.port';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { ITenantRepository } from '../../../domain/repositories/tenant.repository';
import { TenantPlan } from '../../../domain/entities/tenant.entity';
import { AuthProvider, UserRole } from '../../../domain/entities/user.entity';

export class SetupUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly hasher: IHasher,
    private readonly generateTokens: (payload: JwtPayload) => AuthTokensOutput,
  ) {}

  async execute(input: SetupInput): Promise<AuthTokensOutput> {
    const tenantCount = await this.tenantRepo.count();
    if (tenantCount > 0) {
      throw new SetupAlreadyCompleteError('Setup has already been completed');
    }

    const slug = this.slugify(input.orgName);

    const tenant = await this.tenantRepo.create({
      name: input.orgName,
      slug,
      plan: TenantPlan.FREE,
      settings: { enableAuditLog: true },
      maxConnections: -1,
      maxUsers: -1,
      isActive: true,
    });

    const passwordHash = await this.hasher.hash(input.password);

    const user = await this.userRepo.create({
      tenantId: tenant.id,
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      avatarUrl: null,
      role: UserRole.OWNER,
      authProvider: AuthProvider.LOCAL,
      externalId: null,
      lastLoginAt: new Date(),
      isActive: true,
    });

    return this.generateTokens({
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role,
    });
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export class SetupAlreadyCompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupAlreadyCompleteError';
  }
}
