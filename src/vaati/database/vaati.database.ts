import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { parsePsql } from '@waha/core/storage/psql/PsqlConnectionConfig';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { createVaatiSchema } from '@waha/vaati/database/schema';
import { VaatiRole, VaatiTenantStatus } from '@waha/vaati/types/vaati.types';
import Knex, { Knex as KnexType } from 'knex';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

@Injectable()
export class VaatiDatabaseService implements OnModuleInit, OnModuleDestroy {
  public knex: KnexType;

  constructor(
    private readonly config: VaatiConfigService,
    @InjectPinoLogger('VaatiDatabaseService') private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.isEnabled) {
      this.logger.info('VAATI platform is disabled via config.');
      return;
    }

    await this.initDatabase();
    await createVaatiSchema(this.knex);
    await this.seedDefaults();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.knex) {
      await this.knex.destroy();
      this.logger.info('VAATI database connection pool closed.');
    }
  }

  private async initDatabase(): Promise<void> {
    const dbType = this.config.databaseType;
    if (dbType === 'pg') {
      const psqlConfig = parsePsql(this.config.databaseUrl);
      this.logger.info({ host: psqlConfig.host, database: psqlConfig.database }, 'Connecting VAATI to PostgreSQL');
      this.knex = Knex({
        client: 'pg',
        connection: {
          host: psqlConfig.host,
          port: psqlConfig.port,
          user: psqlConfig.user,
          password: psqlConfig.password,
          database: psqlConfig.database,
          ssl: psqlConfig.ssl,
        },
        pool: {
          min: 2,
          max: 10,
        },
      });
    } else {
      const sqlitePath = this.config.sqliteFilePath;
      const dir = path.dirname(sqlitePath);
      if (sqlitePath !== ':memory:' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.logger.info({ sqlitePath: sqlitePath }, 'Connecting VAATI to SQLite store');
      this.knex = Knex({
        client: 'better-sqlite3',
        connection: {
          filename: sqlitePath,
        },
        useNullAsDefault: true,
      });
    }
  }

  private async seedDefaults(): Promise<void> {
    const defaultTenantId = this.config.defaultTenantId;
    const existingTenant = await this.knex('vaati_tenants')
      .where({ id: defaultTenantId })
      .first();

    if (!existingTenant) {
      await this.knex('vaati_tenants').insert({
        id: defaultTenantId,
        name: this.config.defaultTenantName,
        status: VaatiTenantStatus.ACTIVE,
        rate_limit_per_minute: this.config.rateLimitPerMinute,
        max_queues: 100,
        max_payload_bytes: this.config.maxPayloadBytes,
      });
      this.logger.info({ tenantId: defaultTenantId }, 'Seeded default VAATI tenant');
    }

    const masterKey = this.config.masterApiKey;
    const masterHash = hashApiKey(masterKey);
    const existingKey = await this.knex('vaati_api_keys')
      .where({ key_hash: masterHash })
      .first();

    if (!existingKey) {
      const keyPrefix = masterKey.slice(0, 8);
      await this.knex('vaati_api_keys').insert({
        id: 'key_master_default',
        tenant_id: defaultTenantId,
        key_hash: masterHash,
        key_prefix: keyPrefix,
        role: VaatiRole.ADMIN,
        allowed_exchanges: '["*"]',
        allowed_queues: '["*"]',
      });
      this.logger.info({ keyPrefix: keyPrefix, tenantId: defaultTenantId }, 'Seeded default VAATI master admin key');
    }
  }
}
