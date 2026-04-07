import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CACHE_SERVICE, ICacheService } from '../../../application/ports/cache.port';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@Inject(CACHE_SERVICE) private readonly cache: ICacheService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    let redisStatus = 'down';
    try {
      await this.cache.set('health:check', 'ok', 5000);
      const val = await this.cache.get<string>('health:check');
      redisStatus = val === 'ok' ? 'healthy' : 'degraded';
    } catch {
      redisStatus = 'down';
    }

    return {
      status: 'healthy',
      service: 'api-gateway',
      version: process.env.npm_package_version || '0.1.0',
      timestamp: new Date().toISOString(),
      services: { redis: redisStatus },
    };
  }
}
