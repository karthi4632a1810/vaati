import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Injectable, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class VaatiIdempotencyService {
  private inMemoryCache = new Map<string, number>();

  constructor(
    @InjectPinoLogger('VaatiIdempotencyService') private readonly logger: PinoLogger,
    @Optional() @InjectRedis() private readonly redis?: Redis,
  ) {}

  async acquire(tenantId: string, idempotencyKey: string, ttlMs: number = 86400000): Promise<boolean> {
    const key = `vaati:idemp:${tenantId}:${idempotencyKey}`;

    if (this.redis) {
      try {
        const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
        return result === 'OK';
      } catch (err: any) {
        this.logger.warn({ key: key, err: err.message }, 'Redis idempotency acquire failed, falling back to memory');
      }
    }

    // In-memory fallback
    const now = Date.now();
    const expiry = this.inMemoryCache.get(key);
    if (expiry && now < expiry) {
      return false; // already locked
    }

    this.inMemoryCache.set(key, now + ttlMs);
    return true;
  }

  async release(tenantId: string, idempotencyKey: string): Promise<void> {
    const key = `vaati:idemp:${tenantId}:${idempotencyKey}`;
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err: any) {
        this.logger.warn({ key: key, err: err.message }, 'Redis idempotency release failed');
      }
    }
    this.inMemoryCache.delete(key);
  }
}
