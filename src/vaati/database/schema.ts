import { Knex } from 'knex';

export async function createVaatiSchema(knex: Knex): Promise<void> {
  // 1. Tenants Table
  const hasTenants = await knex.schema.hasTable('vaati_tenants');
  if (!hasTenants) {
    await knex.schema.createTable('vaati_tenants', (table) => {
      table.string('id', 64).primary();
      table.string('name', 255).notNullable();
      table.string('status', 32).notNullable().defaultTo('ACTIVE');
      table.integer('rate_limit_per_minute').notNullable().defaultTo(6000);
      table.integer('max_queues').notNullable().defaultTo(100);
      table.integer('max_payload_bytes').notNullable().defaultTo(10485760);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // 2. API Keys Table
  const hasApiKeys = await knex.schema.hasTable('vaati_api_keys');
  if (!hasApiKeys) {
    await knex.schema.createTable('vaati_api_keys', (table) => {
      table.string('id', 64).primary();
      table.string('tenant_id', 64).notNullable().references('id').inTable('vaati_tenants').onDelete('CASCADE');
      table.string('key_hash', 128).notNullable().unique();
      table.string('key_prefix', 16).notNullable();
      table.string('role', 32).notNullable().defaultTo('PUBLISHER');
      table.text('allowed_exchanges').defaultTo('["*"]');
      table.text('allowed_queues').defaultTo('["*"]');
      table.timestamp('expires_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // 3. Exchanges Table
  const hasExchanges = await knex.schema.hasTable('vaati_exchanges');
  if (!hasExchanges) {
    await knex.schema.createTable('vaati_exchanges', (table) => {
      table.string('id', 64).primary();
      table.string('tenant_id', 64).notNullable().references('id').inTable('vaati_tenants').onDelete('CASCADE');
      table.string('name', 128).notNullable();
      table.string('type', 32).notNullable();
      table.boolean('durable').notNullable().defaultTo(true);
      table.boolean('auto_delete').notNullable().defaultTo(false);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'name']);
    });
  }

  // 4. Queues Table
  const hasQueues = await knex.schema.hasTable('vaati_queues');
  if (!hasQueues) {
    await knex.schema.createTable('vaati_queues', (table) => {
      table.string('id', 64).primary();
      table.string('tenant_id', 64).notNullable().references('id').inTable('vaati_tenants').onDelete('CASCADE');
      table.string('name', 128).notNullable();
      table.boolean('durable').notNullable().defaultTo(true);
      table.boolean('priority').notNullable().defaultTo(false);
      table.integer('max_attempts').notNullable().defaultTo(5);
      table.bigInteger('message_ttl_ms').defaultTo(86400000);
      table.string('dead_letter_exchange', 128).nullable();
      table.string('dead_letter_routing_key', 255).nullable();
      table.string('state', 32).notNullable().defaultTo('ACTIVE');
      table.integer('concurrency_limit').notNullable().defaultTo(50);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'name']);
    });
  }

  // 5. Exchange-to-Queue Bindings Table
  const hasBindings = await knex.schema.hasTable('vaati_bindings');
  if (!hasBindings) {
    await knex.schema.createTable('vaati_bindings', (table) => {
      table.string('id', 64).primary();
      table.string('tenant_id', 64).notNullable().references('id').inTable('vaati_tenants').onDelete('CASCADE');
      table.string('exchange_name', 128).notNullable();
      table.string('queue_name', 128).notNullable();
      table.string('binding_key', 255).notNullable().defaultTo('');
      table.text('header_rules').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.unique(['tenant_id', 'exchange_name', 'queue_name', 'binding_key']);
    });
  }

  // 6. Messages Table (Transactional Outbox)
  const hasMessages = await knex.schema.hasTable('vaati_messages');
  if (!hasMessages) {
    await knex.schema.createTable('vaati_messages', (table) => {
      table.string('id', 64).primary();
      table.string('tenant_id', 64).notNullable().references('id').inTable('vaati_tenants').onDelete('CASCADE');
      table.string('exchange_name', 128).notNullable();
      table.string('routing_key', 255).notNullable();
      table.string('correlation_id', 128).nullable();
      table.string('causation_id', 128).nullable();
      table.string('idempotency_key', 128).nullable();
      table.text('headers').defaultTo('{}');
      table.text('payload').notNullable();
      table.integer('priority').defaultTo(0);
      table.bigInteger('ttl_ms').nullable();
      table.integer('max_attempts').defaultTo(5);
      table.integer('attempts_made').defaultTo(0);
      table.string('status', 32).notNullable();
      table.text('error_summary').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index(['tenant_id', 'status', 'created_at']);
      table.index(['tenant_id', 'correlation_id']);
    });
  }

  // 7. Dead Letter Records Table
  const hasDeadLetters = await knex.schema.hasTable('vaati_dead_letters');
  if (!hasDeadLetters) {
    await knex.schema.createTable('vaati_dead_letters', (table) => {
      table.string('id', 64).primary();
      table.string('tenant_id', 64).notNullable().references('id').inTable('vaati_tenants').onDelete('CASCADE');
      table.string('message_id', 64).notNullable();
      table.string('original_queue', 128).notNullable();
      table.string('original_exchange', 128).notNullable();
      table.string('routing_key', 255).notNullable();
      table.text('payload').notNullable();
      table.text('headers').nullable();
      table.text('failure_reason').notNullable();
      table.text('stack_trace').nullable();
      table.integer('redelivery_count').notNullable();
      table.timestamp('first_failed_at', { useTz: true }).notNullable();
      table.timestamp('last_failed_at', { useTz: true }).notNullable();
      table.boolean('replayed').defaultTo(false);
      table.timestamp('replayed_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index(['tenant_id', 'created_at']);
      table.index(['tenant_id', 'message_id']);
    });
  }

  // 8. Immutable Audit Logs Table
  const hasAuditLogs = await knex.schema.hasTable('vaati_audit_logs');
  if (!hasAuditLogs) {
    await knex.schema.createTable('vaati_audit_logs', (table) => {
      table.increments('id').primary();
      table.string('tenant_id', 64).notNullable();
      table.string('actor_id', 64).notNullable();
      table.string('actor_role', 32).notNullable();
      table.string('action', 64).notNullable();
      table.string('resource_type', 64).notNullable();
      table.string('resource_id', 128).notNullable();
      table.text('details').nullable();
      table.string('ip_address', 45).nullable();
      table.timestamp('timestamp', { useTz: true }).defaultTo(knex.fn.now());

      table.index(['tenant_id', 'timestamp']);
      table.index(['tenant_id', 'action']);
    });
  }
}
