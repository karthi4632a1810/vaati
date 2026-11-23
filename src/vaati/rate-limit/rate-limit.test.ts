import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { VaatiRateLimitService } from '@waha/vaati/rate-limit/vaati-rate-limit.service';

describe('VaatiRateLimitService', () => {
  let config: VaatiConfigService;
  let logger: any;
  let rateLimitService: VaatiRateLimitService;

  beforeEach(() => {
    config = {
      rateLimitPerMinute: 5,
    } as any;
    logger = {
      warn: jest.fn(),
      info: jest.fn(),
    };
    rateLimitService = new VaatiRateLimitService(config, logger);
  });

  test('allows requests within tenant rate limit', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await rateLimitService.checkRateLimit('tenant-alpha', 5);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(5 - (i + 1));
    }
  });

  test('blocks requests exceeding tenant rate limit', async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimitService.checkRateLimit('tenant-beta', 5);
    }
    const overflow = await rateLimitService.checkRateLimit('tenant-beta', 5);
    expect(overflow.allowed).toBe(false);
    expect(overflow.remaining).toBe(0);
    expect(overflow.resetMs).toBeGreaterThan(0);
  });
});
