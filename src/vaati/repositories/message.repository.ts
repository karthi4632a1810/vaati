import { Injectable } from '@nestjs/common';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiMessage, VaatiMessageStatus } from '@waha/vaati/types/vaati.types';

@Injectable()
export class MessageRepository {
  constructor(private readonly db: VaatiDatabaseService) {}

  async findById(tenantId: string, id: string): Promise<VaatiMessage | null> {
    const row = await this.db.knex('vaati_messages')
      .where({ tenant_id: tenantId, id: id })
      .first();
    if (!row) {
      return null;
    }
    return this.mapRow(row);
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<VaatiMessage | null> {
    const row = await this.db.knex('vaati_messages')
      .where({ tenant_id: tenantId, idempotency_key: idempotencyKey })
      .first();
    if (!row) {
      return null;
    }
    return this.mapRow(row);
  }

  async findByCorrelationId(tenantId: string, correlationId: string): Promise<VaatiMessage[]> {
    const rows = await this.db.knex('vaati_messages')
      .where({ tenant_id: tenantId, correlation_id: correlationId })
      .orderBy('created_at', 'desc');
    return rows.map((row) => this.mapRow(row));
  }

  async findPendingOutbox(limit: number = 100): Promise<VaatiMessage[]> {
    const rows = await this.db.knex('vaati_messages')
      .where({ status: VaatiMessageStatus.PERSISTED })
      .orderBy('created_at', 'asc')
      .limit(limit);
    return rows.map((row) => this.mapRow(row));
  }

  async create(data: {
    id: string;
    tenantId: string;
    exchangeName: string;
    routingKey: string;
    correlationId?: string | null;
    causationId?: string | null;
    idempotencyKey?: string | null;
    headers?: Record<string, any>;
    payload: any;
    priority?: number;
    ttlMs?: number | null;
    maxAttempts?: number;
    status?: VaatiMessageStatus;
  }): Promise<VaatiMessage> {
    const now = new Date();
    await this.db.knex('vaati_messages').insert({
      id: data.id,
      tenant_id: data.tenantId,
      exchange_name: data.exchangeName,
      routing_key: data.routingKey,
      correlation_id: data.correlationId ?? null,
      causation_id: data.causationId ?? null,
      idempotency_key: data.idempotencyKey ?? null,
      headers: JSON.stringify(data.headers ?? {}),
      payload: JSON.stringify(data.payload),
      priority: data.priority ?? 0,
      ttl_ms: data.ttlMs ?? null,
      max_attempts: data.maxAttempts ?? 5,
      attempts_made: 0,
      status: data.status ?? VaatiMessageStatus.PERSISTED,
      error_summary: null,
      created_at: now,
      updated_at: now,
    });

    const created = await this.findById(data.tenantId, data.id);
    if (!created) {
      throw new Error(`Failed to persist message ${data.id}`);
    }
    return created;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: VaatiMessageStatus,
    options?: { errorSummary?: string | null; incrementAttempts?: boolean },
  ): Promise<void> {
    const updateData: Record<string, any> = {
      status: status,
      updated_at: new Date(),
    };
    if (options?.errorSummary !== undefined) {
      updateData.error_summary = options.errorSummary;
    }
    if (options?.incrementAttempts) {
      updateData.attempts_made = this.db.knex.raw('attempts_made + 1');
    }
    await this.db.knex('vaati_messages')
      .where({ tenant_id: tenantId, id: id })
      .update(updateData);
  }

  private mapRow(row: any): VaatiMessage {
    let headers: Record<string, any> = {};
    if (row.headers) {
      try {
        headers = typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers;
      } catch {
        headers = {};
      }
    }

    let payload: any = row.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        // keep string
      }
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      exchangeName: row.exchange_name,
      routingKey: row.routing_key,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      idempotencyKey: row.idempotency_key,
      headers: headers,
      payload: payload,
      priority: Number(row.priority),
      ttlMs: row.ttl_ms ? Number(row.ttl_ms) : null,
      maxAttempts: Number(row.max_attempts),
      attemptsMade: Number(row.attempts_made),
      status: row.status as VaatiMessageStatus,
      errorSummary: row.error_summary,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
