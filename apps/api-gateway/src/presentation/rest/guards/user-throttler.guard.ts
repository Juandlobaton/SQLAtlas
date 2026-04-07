import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom throttler that rate-limits by userId (authenticated) or IP (anonymous).
 * This prevents a single user from consuming the entire rate limit quota.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If user is authenticated, throttle by userId
    const user = req.user;
    if (user?.sub) {
      return `user:${user.sub}`;
    }
    // Otherwise, throttle by IP
    return req.ips?.length ? req.ips[0] : req.ip;
  }
}
