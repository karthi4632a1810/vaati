import { createVaatiSchema } from '@waha/vaati/database/schema';
import Knex, { Knex as KnexType } from 'knex';

describe('VAATI Database Schema', () => {
  let knex: KnexType;

  beforeAll(async () => {
    knex = Knex({
      client: 'better-sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    });
    await createVaatiSchema(knex);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  test('creates all 8 required VAATI tables in schema', async () => {
    const requiredTables = [
      'vaati_tenants',
      'vaati_api_keys',
      'vaati_exchanges',
      'vaati_queues',
      'vaati_bindings',
      'vaati_messages',
      'vaati_dead_letters',
      'vaati_audit_logs',
    ];

    for (const table of requiredTables) {
      const exists = await knex.schema.hasTable(table);
      expect(exists).toBe(true);
    }
  });

  test('is idempotent when createVaatiSchema is invoked multiple times', async () => {
    await expect(createVaatiSchema(knex)).resolves.not.toThrow();
  });
});
