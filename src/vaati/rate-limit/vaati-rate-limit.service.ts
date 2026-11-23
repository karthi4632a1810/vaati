import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Injectable, Optional } from '@nestjs/common';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

@Injectable()
export class VaatiRateLimitService {
  private inMemoryBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly config: VaatiConfigService,
    @InjectPinoLogger('VaatiRateLimitService') private readonly logger: PinoLogger,
    @Optional() @InjectRedis() private readonly redis?: Redis,
  ) {}

  async checkRateLimit(tenantId: string, limitPerMinute?: number): Promise<RateLimitResult> {
    const limit = limitPerMinute ?? this.config.rateLimitPerMinute;
    const windowMs = 60000;
    const now = Date.now();

    if (this.redis) {
      try {
        const key = `vaati:ratelimit:${tenantId}:${Math.floor(now / windowMs)}`;
        const currentCount = await this.redis.incr(key);
        if (currentCount === 1) {
          await this.redis.pexpire(key, windowMs);
        }

        const remaining = Math.max(0, limit - currentCount);
        const resetMs = windowMs - (now % windowMs);

        return {
          allowed: currentCount <= limit,
          limit: limit,
          remaining: remaining,
          resetMs: resetMs,
        };
      } catch (err) {
        this.logger.warn({ err: err, tenantId: tenantId }, 'Redis rate limit failed, falling back to memory');
      }
    }

    // In-Memory Fallback
    let bucket = this.inMemoryBuckets.get(tenantId);
    if (!bucket || now >= bucket.resetAt) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.inMemoryBuckets.set(tenantId, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, limit - bucket.count);
    const resetMs = Math.max(0, bucket.resetAt - now);

    return {
      allowed: bucket.count <= limit,
      limit: limit,
      remaining: remaining,
      resetMs: resetMs,
    };
  }
}
