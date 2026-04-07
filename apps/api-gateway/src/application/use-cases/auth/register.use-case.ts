import { AuthTokensOutput, JwtPayload, RegisterInput } from '../../dto/auth.dto';
import { IHasher } from '../../ports/hasher.port';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { ITenantRepository } from '../../../domain/repositories/tenant.repository';
import { TenantPlan } from '../../../domain/entities/tenant.entity';
import { AuthProvider, UserRole } from '../../../domain/entities/user.entity';

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly hasher: IHasher,
    private readonly generateTokens: (payload: JwtPayload) => AuthTokensOutput,
  ) {}

  async execute(input: RegisterInput): Promise<AuthTokensOutput> {
    const existingTenant = await this.tenantRepo.findBySlug(this.slugify(input.tenantName));
    if (existingTenant) {
      throw new RegistrationError('Organization name already taken');
    }

    const tenant = await this.tenantRepo.create({
      name: input.tenantName,
      slug: this.slugify(input.tenantName),
      plan: TenantPlan.FREE,
      settings: {},
      maxConnections: 2,
      maxUsers: 3,
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

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role,
    };

    return this.generateTokens(payload);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export class RegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}
