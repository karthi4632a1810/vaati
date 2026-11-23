import { Injectable } from '@nestjs/common';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiAuditLog, VaatiRole } from '@waha/vaati/types/vaati.types';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly db: VaatiDatabaseService) {}

  async log(data: {
    tenantId: string;
    actorId: string;
    actorRole: VaatiRole;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, any> | null;
    ipAddress?: string | null;
  }): Promise<void> {
    await this.db.knex('vaati_audit_logs').insert({
      tenant_id: data.tenantId,
      actor_id: data.actorId,
      actor_role: data.actorRole,
      action: data.action,
      resource_type: data.resourceType,
      resource_id: data.resourceId,
      details: data.details ? JSON.stringify(data.details) : null,
      ip_address: data.ipAddress ?? null,
      timestamp: new Date(),
    });
  }

  async findByTenant(
    tenantId: string,
    options?: {
      action?: string;
      resourceType?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<VaatiAuditLog[]> {
    let query = this.db.knex('vaati_audit_logs').where({ tenant_id: tenantId });
    if (options?.action) {
      query = query.andWhere({ action: options.action });
    }
    if (options?.resourceType) {
      query = query.andWhere({ resource_type: options.resourceType });
    }

    const rows = await query
      .orderBy('timestamp', 'desc')
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: any): VaatiAuditLog {
    let details: Record<string, any> | null = null;
    if (row.details) {
      try {
        details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      } catch {
        details = null;
      }
    }

    return {
      id: Number(row.id),
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      actorRole: row.actor_role as VaatiRole,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details: details,
      ipAddress: row.ip_address,
      timestamp: new Date(row.timestamp),
    };
  }
}
