import { ServiceUnavailableException } from '@nestjs/common';
import { VaatiHealthController } from '@waha/vaati/controllers/vaati.health.controller';

describe('VaatiHealthController', () => {
  let controller: VaatiHealthController;
  let mockConfig: any;
  let mockDb: any;

  beforeEach(() => {
    mockConfig = {
      databaseType: 'pg',
    };
    mockDb = {
      knex: {
        raw: jest.fn().mockResolvedValue(true),
      },
    };
    controller = new VaatiHealthController(mockConfig, mockDb);
  });

  test('liveness probe returns UP status', async () => {
    const res = await controller.getLiveness();
    expect(res.status).toBe('UP');
    expect(typeof res.uptimeSeconds).toBe('number');
  });

  test('readiness probe returns 200 when database is healthy', async () => {
    const res = await controller.getReadiness();
    expect(res.status).toBe('UP');
    expect(res.database).toBe('UP');
  });

  test('readiness probe throws ServiceUnavailableException when database query fails', async () => {
    mockDb.knex.raw.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

    await expect(controller.getReadiness()).rejects.toThrow(ServiceUnavailableException);
  });
});
