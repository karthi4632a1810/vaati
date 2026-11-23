import { Injectable } from '@nestjs/common';
import { hashApiKey, VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiApiKey, VaatiRole } from '@waha/vaati/types/vaati.types';

@Injectable()
export class ApiKeyRepository {
  constructor(private readonly db: VaatiDatabaseService) {}

  async findByRawKey(rawKey: string): Promise<VaatiApiKey | null> {
    const keyHash = hashApiKey(rawKey);
    const row = await this.db.knex('vaati_api_keys').where({ key_hash: keyHash }).first();
    if (!row) {
      return null;
    }
    return this.mapRow(row);
  }

  async findById(id: string): Promise<VaatiApiKey | null> {
    const row = await this.db.knex('vaati_api_keys').where({ id: id }).first();
    if (!row) {
      return null;
    }
    return this.mapRow(row);
  }

  async findByTenant(tenantId: string): Promise<VaatiApiKey[]> {
    const rows = await this.db.knex('vaati_api_keys')
      .where({ tenant_id: tenantId })
      .orderBy('created_at', 'desc');
    return rows.map((row) => this.mapRow(row));
  }

  async create(data: {
    id: string;
    tenantId: string;
    rawKey: string;
    role: VaatiRole;
    allowedExchanges?: string[];
    allowedQueues?: string[];
    expiresAt?: Date | null;
  }): Promise<{ apiKey: VaatiApiKey; rawKey: string }> {
    const keyHash = hashApiKey(data.rawKey);
    const keyPrefix = data.rawKey.slice(0, 8);
    const now = new Date();

    await this.db.knex('vaati_api_keys').insert({
      id: data.id,
      tenant_id: data.tenantId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      role: data.role,
      allowed_exchanges: JSON.stringify(data.allowedExchanges ?? ['*']),
      allowed_queues: JSON.stringify(data.allowedQueues ?? ['*']),
      expires_at: data.expiresAt ?? null,
      created_at: now,
    });

    const created = await this.findById(data.id);
    if (!created) {
      throw new Error(`Failed to create API key ${data.id}`);
    }
    return { apiKey: created, rawKey: data.rawKey };
  }

  async revoke(id: string): Promise<void> {
    await this.db.knex('vaati_api_keys').where({ id: id }).delete();
  }

  private mapRow(row: any): VaatiApiKey {
    let allowedExchanges: string[] = ['*'];
    if (row.allowed_exchanges) {
      try {
        allowedExchanges = typeof row.allowed_exchanges === 'string'
          ? JSON.parse(row.allowed_exchanges)
          : row.allowed_exchanges;
      } catch {
        allowedExchanges = ['*'];
      }
    }

    let allowedQueues: string[] = ['*'];
    if (row.allowed_queues) {
      try {
        allowedQueues = typeof row.allowed_queues === 'string'
          ? JSON.parse(row.allowed_queues)
          : row.allowed_queues;
      } catch {
        allowedQueues = ['*'];
      }
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      keyHash: row.key_hash,
      keyPrefix: row.key_prefix,
      role: row.role as VaatiRole,
      allowedExchanges: allowedExchanges,
      allowedQueues: allowedQueues,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
