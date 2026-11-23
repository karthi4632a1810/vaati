import { Injectable } from '@nestjs/common';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiBinding } from '@waha/vaati/types/vaati.types';

@Injectable()
export class BindingRepository {
  constructor(private readonly db: VaatiDatabaseService) {}

  async findByExchange(tenantId: string, exchangeName: string): Promise<VaatiBinding[]> {
    const rows = await this.db.knex('vaati_bindings')
      .where({ tenant_id: tenantId, exchange_name: exchangeName });
    return rows.map((row) => this.mapRow(row));
  }

  async findByQueue(tenantId: string, queueName: string): Promise<VaatiBinding[]> {
    const rows = await this.db.knex('vaati_bindings')
      .where({ tenant_id: tenantId, queue_name: queueName });
    return rows.map((row) => this.mapRow(row));
  }

  async bind(data: {
    id: string;
    tenantId: string;
    exchangeName: string;
    queueName: string;
    bindingKey?: string;
    headerRules?: Record<string, any> | null;
  }): Promise<VaatiBinding> {
    const bindingKey = data.bindingKey ?? '';
    const existing = await this.db.knex('vaati_bindings')
      .where({
        tenant_id: data.tenantId,
        exchange_name: data.exchangeName,
        queue_name: data.queueName,
        binding_key: bindingKey,
      })
      .first();

    if (existing) {
      return this.mapRow(existing);
    }

    const now = new Date();
    await this.db.knex('vaati_bindings').insert({
      id: data.id,
      tenant_id: data.tenantId,
      exchange_name: data.exchangeName,
      queue_name: data.queueName,
      binding_key: bindingKey,
      header_rules: data.headerRules ? JSON.stringify(data.headerRules) : null,
      created_at: now,
    });

    const created = await this.db.knex('vaati_bindings')
      .where({ id: data.id })
      .first();
    if (!created) {
      throw new Error(`Failed to bind queue ${data.queueName} to exchange ${data.exchangeName}`);
    }
    return this.mapRow(created);
  }

  async unbind(
    tenantId: string,
    exchangeName: string,
    queueName: string,
    bindingKey: string = '',
  ): Promise<boolean> {
    const count = await this.db.knex('vaati_bindings')
      .where({
        tenant_id: tenantId,
        exchange_name: exchangeName,
        queue_name: queueName,
        binding_key: bindingKey,
      })
      .delete();
    return count > 0;
  }

  private mapRow(row: any): VaatiBinding {
    let headerRules: Record<string, any> | null = null;
    if (row.header_rules) {
      try {
        headerRules = typeof row.header_rules === 'string'
          ? JSON.parse(row.header_rules)
          : row.header_rules;
      } catch {
        headerRules = null;
      }
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      exchangeName: row.exchange_name,
      queueName: row.queue_name,
      bindingKey: row.binding_key,
      headerRules: headerRules,
      createdAt: new Date(row.created_at),
    };
  }
}
