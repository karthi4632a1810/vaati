import { Injectable } from '@nestjs/common';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiTenant, VaatiTenantStatus } from '@waha/vaati/types/vaati.types';

@Injectable()
export class TenantRepository {
  constructor(private readonly db: VaatiDatabaseService) {}

  async findById(id: string): Promise<VaatiTenant | null> {
    const row = await this.db.knex('vaati_tenants').where({ id: id }).first();
    if (!row) {
      return null;
    }
    return this.mapRow(row);
  }

  async findAll(): Promise<VaatiTenant[]> {
    const rows = await this.db.knex('vaati_tenants').select('*').orderBy('created_at', 'desc');
    return rows.map((row) => this.mapRow(row));
  }

  async create(tenant: {
    id: string;
    name: string;
    status?: VaatiTenantStatus;
    rateLimitPerMinute?: number;
    maxQueues?: number;
    maxPayloadBytes?: number;
  }): Promise<VaatiTenant> {
    const now = new Date();
    await this.db.knex('vaati_tenants').insert({
      id: tenant.id,
      name: tenant.name,
      status: tenant.status ?? VaatiTenantStatus.ACTIVE,
      rate_limit_per_minute: tenant.rateLimitPerMinute ?? 6000,
      max_queues: tenant.maxQueues ?? 100,
      max_payload_bytes: tenant.maxPayloadBytes ?? 10485760,
      created_at: now,
      updated_at: now,
    });
    const created = await this.findById(tenant.id);
    if (!created) {
      throw new Error(`Failed to create tenant ${tenant.id}`);
    }
    return created;
  }

  async updateStatus(id: string, status: VaatiTenantStatus): Promise<void> {
    await this.db.knex('vaati_tenants').where({ id: id }).update({
      status: status,
      updated_at: new Date(),
    });
  }

  async updateQuotas(id: string, quotas: {
    rateLimitPerMinute?: number;
    maxQueues?: number;
    maxPayloadBytes?: number;
  }): Promise<void> {
    const updateData: Record<string, any> = {
      updated_at: new Date(),
    };
    if (quotas.rateLimitPerMinute !== undefined) {
      updateData.rate_limit_per_minute = quotas.rateLimitPerMinute;
    }
    if (quotas.maxQueues !== undefined) {
      updateData.max_queues = quotas.maxQueues;
    }
    if (quotas.maxPayloadBytes !== undefined) {
      updateData.max_payload_bytes = quotas.maxPayloadBytes;
    }
    await this.db.knex('vaati_tenants').where({ id: id }).update(updateData);
  }

  private mapRow(row: any): VaatiTenant {
    return {
      id: row.id,
      name: row.name,
      status: row.status as VaatiTenantStatus,
      rateLimitPerMinute: Number(row.rate_limit_per_minute),
      maxQueues: Number(row.max_queues),
      maxPayloadBytes: Number(row.max_payload_bytes),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
