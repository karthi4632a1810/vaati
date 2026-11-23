import { Injectable } from '@nestjs/common';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiExchange, VaatiExchangeType } from '@waha/vaati/types/vaati.types';

@Injectable()
export class ExchangeRepository {
  constructor(private readonly db: VaatiDatabaseService) {}

  async findByName(tenantId: string, name: string): Promise<VaatiExchange | null> {
    const row = await this.db.knex('vaati_exchanges')
      .where({ tenant_id: tenantId, name: name })
      .first();
    if (!row) {
      return null;
    }
    return this.mapRow(row);
  }

  async findByTenant(tenantId: string): Promise<VaatiExchange[]> {
    const rows = await this.db.knex('vaati_exchanges')
      .where({ tenant_id: tenantId })
      .orderBy('name', 'asc');
    return rows.map((row) => this.mapRow(row));
  }

  async declare(data: {
    id: string;
    tenantId: string;
    name: string;
    type: VaatiExchangeType;
    durable?: boolean;
    autoDelete?: boolean;
  }): Promise<VaatiExchange> {
    const existing = await this.findByName(data.tenantId, data.name);
    if (existing) {
      if (existing.type !== data.type) {
        throw new Error(
          `Exchange ${data.name} already exists with differing type (${existing.type} vs ${data.type})`,
        );
      }
      return existing;
    }

    const now = new Date();
    await this.db.knex('vaati_exchanges').insert({
      id: data.id,
      tenant_id: data.tenantId,
      name: data.name,
      type: data.type,
      durable: data.durable ?? true,
      auto_delete: data.autoDelete ?? false,
      created_at: now,
    });

    const created = await this.findByName(data.tenantId, data.name);
    if (!created) {
      throw new Error(`Failed to declare exchange ${data.name}`);
    }
    return created;
  }

  async delete(tenantId: string, name: string): Promise<boolean> {
    const count = await this.db.knex('vaati_exchanges')
      .where({ tenant_id: tenantId, name: name })
      .delete();
    return count > 0;
  }

  private mapRow(row: any): VaatiExchange {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      type: row.type as VaatiExchangeType,
      durable: Boolean(row.durable),
      autoDelete: Boolean(row.auto_delete),
      createdAt: new Date(row.created_at),
    };
  }
}
