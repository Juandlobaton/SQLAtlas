import { SystemStatusOutput } from '../../dto/auth.dto';
import { ITenantRepository } from '../../../domain/repositories/tenant.repository';

export class GetSystemStatusUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly registrationMode: 'closed' | 'invite-only' | 'open',
    private readonly multiTenant: boolean,
    private readonly microsoftSso: boolean = false,
  ) {}

  async execute(): Promise<SystemStatusOutput> {
    const tenantCount = await this.tenantRepo.count();
    return {
      needsSetup: tenantCount === 0,
      registrationMode: this.registrationMode,
      multiTenant: this.multiTenant,
      microsoftSso: this.microsoftSso,
    };
  }
}
