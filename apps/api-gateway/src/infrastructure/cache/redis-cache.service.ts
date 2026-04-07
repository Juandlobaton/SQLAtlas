import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ICacheService } from '../../application/ports/cache.port';

@Injectable()
export class RedisCacheService implements ICacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cache.get<T>(key);
      if (value) this.logger.debug(`Cache HIT: ${key}`);
      return value ?? null;
    } catch (e) {
      this.logger.warn(`Cache GET failed for ${key}: ${(e as Error).message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttlMs);
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttlMs || 'default'}ms)`);
    } catch (e) {
      this.logger.warn(`Cache SET failed for ${key}: ${(e as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
    } catch (e) {
      this.logger.warn(`Cache DEL failed for ${key}: ${(e as Error).message}`);
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    try {
      // Access the underlying ioredis store to use SCAN for pattern deletion
      const store = (this.cache as any).store;
      if (store?.client) {
        const client = store.client;
        let cursor = '0';
        do {
          const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = nextCursor;
          if (keys.length > 0) {
            await client.del(...keys);
            this.logger.debug(`Cache DEL pattern ${pattern}: removed ${keys.length} keys`);
          }
        } while (cursor !== '0');
      }
    } catch (e) {
      this.logger.warn(`Cache DEL pattern failed for ${pattern}: ${(e as Error).message}`);
    }
  }

  async flush(): Promise<void> {
    try {
      await this.cache.reset();
      this.logger.log('Cache FLUSHED');
    } catch (e) {
      this.logger.warn(`Cache FLUSH failed: ${(e as Error).message}`);
    }
  }
}
