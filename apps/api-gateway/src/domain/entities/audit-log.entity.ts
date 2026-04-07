/**
 * Domain Entity: Audit Log entry.
 */
export class AuditLog {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly action: string,
    public readonly resourceType: string,
    public readonly resourceId: string | null,
    public readonly details: Record<string, unknown>,
    public readonly ipAddress: string | null,
    public readonly userAgent: string | null,
    public readonly createdAt: Date,
  ) {}
}
