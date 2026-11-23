import { Injectable } from '@nestjs/common';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiDeadLetter } from '@waha/vaati/types/vaati.types';

@Injectable()
export class DeadLetterRepository {
  constructor(private readonly db: VaatiDatabaseService) {}

  async findById(tenantId: string, id: string): Promise<VaatiDeadLetter | null> {
    const row = await this.db.knex('vaati_dead_letters')
      .where({ tenant_id: tenantId, id: id })
      .first();
    if (!row) {
      return null;
    }
    return this.mapRow(row);
  }

  async findByTenant(
    tenantId: string,
    options?: {
      queue?: string;
      replayed?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: VaatiDeadLetter[]; total: number }> {
    let query = this.db.knex('vaati_dead_letters').where({ tenant_id: tenantId });
    if (options?.queue) {
      query = query.andWhere({ original_queue: options.queue });
    }
    if (options?.replayed !== undefined) {
      query = query.andWhere({ replayed: options.replayed });
    }

    const countRes = await query.clone().count<{ count: string | number }>('* as count').first();
    const total = Number(countRes?.count ?? 0);

    const rows = await query
      .orderBy('created_at', 'desc')
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);

    return {
      items: rows.map((row) => this.mapRow(row)),
      total: total,
    };
  }

  async create(data: {
    id: string;
    tenantId: string;
    messageId: string;
    originalQueue: string;
    originalExchange: string;
    routingKey: string;
    payload: any;
    headers?: Record<string, any> | null;
    failureReason: string;
    stackTrace?: string | null;
    redeliveryCount: number;
    firstFailedAt: Date;
    lastFailedAt: Date;
  }): Promise<VaatiDeadLetter> {
    const now = new Date();
    await this.db.knex('vaati_dead_letters').insert({
      id: data.id,
      tenant_id: data.tenantId,
      message_id: data.messageId,
      original_queue: data.originalQueue,
      original_exchange: data.originalExchange,
      routing_key: data.routingKey,
      payload: JSON.stringify(data.payload),
      headers: data.headers ? JSON.stringify(data.headers) : null,
      failure_reason: data.failureReason,
      stack_trace: data.stackTrace ?? null,
      redelivery_count: data.redeliveryCount,
      first_failed_at: data.firstFailedAt,
      last_failed_at: data.lastFailedAt,
      replayed: false,
      replayed_at: null,
      created_at: now,
    });

    const created = await this.findById(data.tenantId, data.id);
    if (!created) {
      throw new Error(`Failed to record dead letter ${data.id}`);
    }
    return created;
  }

  async markReplayed(tenantId: string, id: string): Promise<void> {
    await this.db.knex('vaati_dead_letters')
      .where({ tenant_id: tenantId, id: id })
      .update({
        replayed: true,
        replayed_at: new Date(),
      });
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const count = await this.db.knex('vaati_dead_letters')
      .where({ tenant_id: tenantId, id: id })
      .delete();
    return count > 0;
  }

  private mapRow(row: any): VaatiDeadLetter {
    let payload = row.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        // string
      }
    }

    let headers: Record<string, any> | null = null;
    if (row.headers) {
      try {
        headers = typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers;
      } catch {
        headers = null;
      }
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      messageId: row.message_id,
      originalQueue: row.original_queue,
      originalExchange: row.original_exchange,
      routingKey: row.routing_key,
      payload: payload,
      headers: headers,
      failureReason: row.failure_reason,
      stackTrace: row.stack_trace,
      redeliveryCount: Number(row.redelivery_count),
      firstFailedAt: new Date(row.first_failed_at),
      lastFailedAt: new Date(row.last_failed_at),
      replayed: Boolean(row.replayed),
      replayedAt: row.replayed_at ? new Date(row.replayed_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
