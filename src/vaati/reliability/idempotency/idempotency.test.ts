import { VaatiIdempotencyService } from '@waha/vaati/reliability/idempotency/vaati-idempotency.service';

describe('VaatiIdempotencyService', () => {
  let idempotencyService: VaatiIdempotencyService;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
    };
    idempotencyService = new VaatiIdempotencyService(mockLogger);
  });

  test('successfully acquires unused idempotency key', async () => {
    const acquired = await idempotencyService.acquire('tenant-1', 'order-unique-101');
    expect(acquired).toBe(true);
  });

  test('rejects duplicate acquisition of the same idempotency key', async () => {
    const first = await idempotencyService.acquire('tenant-1', 'order-duplicate-key');
    expect(first).toBe(true);

    const second = await idempotencyService.acquire('tenant-1', 'order-duplicate-key');
    expect(second).toBe(false);
  });

  test('allows re-acquiring after explicit release', async () => {
    await idempotencyService.acquire('tenant-1', 'order-release-key');
    await idempotencyService.release('tenant-1', 'order-release-key');

    const reacquired = await idempotencyService.acquire('tenant-1', 'order-release-key');
    expect(reacquired).toBe(true);
  });
});
