import { Injectable } from '@nestjs/common';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiQueue, VaatiQueueState } from '@waha/vaati/types/vaati.types';

@Injectable()
export class QueueRepository {
  constructor(private readonly db: VaatiDatabaseService) {}

  async findByName(tenantId: string, name: string): Promise<VaatiQueue | null> {
    const row = await this.db.knex('vaati_queues')
      .where({ tenant_id: tenantId, name: name })
      .first();
    if (!row) {
      return null;
    }
    return this.mapRow(row);
  }

  async findByTenant(tenantId: string): Promise<VaatiQueue[]> {
    const rows = await this.db.knex('vaati_queues')
      .where({ tenant_id: tenantId })
      .orderBy('name', 'asc');
    return rows.map((row) => this.mapRow(row));
  }

  async declare(data: {
    id: string;
    tenantId: string;
    name: string;
    durable?: boolean;
    priority?: boolean;
    maxAttempts?: number;
    messageTtlMs?: number;
    deadLetterExchange?: string | null;
    deadLetterRoutingKey?: string | null;
    concurrencyLimit?: number;
  }): Promise<VaatiQueue> {
    const existing = await this.findByName(data.tenantId, data.name);
    if (existing) {
      return existing;
    }

    const now = new Date();
    await this.db.knex('vaati_queues').insert({
      id: data.id,
      tenant_id: data.tenantId,
      name: data.name,
      durable: data.durable ?? true,
      priority: data.priority ?? false,
      max_attempts: data.maxAttempts ?? 5,
      message_ttl_ms: data.messageTtlMs ?? 86400000,
      dead_letter_exchange: data.deadLetterExchange ?? null,
      dead_letter_routing_key: data.deadLetterRoutingKey ?? null,
      state: VaatiQueueState.ACTIVE,
      concurrency_limit: data.concurrencyLimit ?? 50,
      created_at: now,
    });

    const created = await this.findByName(data.tenantId, data.name);
    if (!created) {
      throw new Error(`Failed to declare queue ${data.name}`);
    }
    return created;
  }

  async updateState(tenantId: string, name: string, state: VaatiQueueState): Promise<void> {
    await this.db.knex('vaati_queues')
      .where({ tenant_id: tenantId, name: name })
      .update({ state: state });
  }

  async delete(tenantId: string, name: string): Promise<boolean> {
    const count = await this.db.knex('vaati_queues')
      .where({ tenant_id: tenantId, name: name })
      .delete();
    return count > 0;
  }

  private mapRow(row: any): VaatiQueue {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      durable: Boolean(row.durable),
      priority: Boolean(row.priority),
      maxAttempts: Number(row.max_attempts),
      messageTtlMs: Number(row.message_ttl_ms),
      deadLetterExchange: row.dead_letter_exchange,
      deadLetterRoutingKey: row.dead_letter_routing_key,
      state: row.state as VaatiQueueState,
      concurrencyLimit: Number(row.concurrency_limit),
      createdAt: new Date(row.created_at),
    };
  }
}
