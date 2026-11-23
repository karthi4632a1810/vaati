import { Injectable } from '@nestjs/common';
import { parseBool } from '@waha/helpers';

@Injectable()
export class VaatiConfigService {
  get isEnabled(): boolean {
    const rawValue = process.env.VAATI_ENABLED ?? 'true';
    return parseBool(rawValue);
  }

  get databaseUrl(): string {
    const directUrl = process.env.VAATI_DATABASE_URL ?? process.env.DATABASE_URL;
    if (directUrl) {
      return directUrl;
    }
    const sessionUrl = process.env.WHATSAPP_SESSIONS_POSTGRESQL_URL;
    if (sessionUrl) {
      return sessionUrl;
    }
    return '';
  }

  get databaseType(): 'pg' | 'better-sqlite3' {
    const url = this.databaseUrl;
    if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
      return 'pg';
    }
    return 'better-sqlite3';
  }

  get sqliteFilePath(): string {
    return process.env.VAATI_SQLITE_PATH ?? './sessions/vaati.sqlite';
  }

  get redisUrl(): string {
    return process.env.VAATI_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://:redis@localhost:6379';
  }

  get defaultTenantId(): string {
    return process.env.VAATI_DEFAULT_TENANT_ID ?? 'default';
  }

  get defaultTenantName(): string {
    return process.env.VAATI_DEFAULT_TENANT_NAME ?? 'Default Enterprise Tenant';
  }

  get masterApiKey(): string {
    return process.env.VAATI_API_KEY ?? process.env.WAHA_API_KEY ?? 'vaati_master_secret_key';
  }

  get rateLimitPerMinute(): number {
    const limit = parseInt(process.env.VAATI_RATE_LIMIT_PER_MINUTE ?? '6000', 10);
    return isNaN(limit) ? 6000 : limit;
  }

  get maxPayloadBytes(): number {
    const size = parseInt(process.env.VAATI_MAX_PAYLOAD_BYTES ?? '10485760', 10);
    return isNaN(size) ? 10485760 : size;
  }

  get apiKeyHeader(): string {
    return process.env.VAATI_API_KEY_HEADER ?? 'x-vaati-api-key';
  }
}
