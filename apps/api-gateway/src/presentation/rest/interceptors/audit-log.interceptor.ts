import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import {
  AUDIT_LOG_REPOSITORY,
  IAuditLogRepository,
} from '../../../domain/repositories/audit-log.repository';
import { JwtPayload } from '../../../application/dto/auth.dto';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only audit mutating operations
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    const user = request.user as JwtPayload | undefined;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        if (!user) return;

        const duration = Date.now() - startTime;
        const path = request.route?.path || request.url;

        this.auditRepo
          .create({
            tenantId: user.tenantId,
            userId: user.sub,
            action: `${method} ${path}`,
            resourceType: this.extractResourceType(path),
            resourceId: request.params?.id || null,
            details: { duration, statusCode: context.switchToHttp().getResponse().statusCode },
            ipAddress: request.ip || null,
            userAgent: request.headers['user-agent'] || null,
          })
          .catch(() => {
            // Audit failures should not break the request
          });
      }),
    );
  }

  private extractResourceType(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] || 'unknown';
  }
}
