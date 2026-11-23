export enum VaatiRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  PUBLISHER = 'PUBLISHER',
  CONSUMER = 'CONSUMER',
  AUDITOR = 'AUDITOR',
}

export enum VaatiTenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DECOMMISSIONED = 'DECOMMISSIONED',
}

export enum VaatiExchangeType {
  DIRECT = 'DIRECT',
  TOPIC = 'TOPIC',
  FANOUT = 'FANOUT',
  HEADERS = 'HEADERS',
}

export enum VaatiQueueState {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DRAINING = 'DRAINING',
  BLOCKED = 'BLOCKED',
  ERROR = 'ERROR',
  DELETED = 'DELETED',
}

export enum VaatiMessageStatus {
  PUBLISHED = 'PUBLISHED',
  VALIDATING = 'VALIDATING',
  PERSISTED = 'PERSISTED',
  ROUTED = 'ROUTED',
  READY = 'READY',
  DELIVERED_TO_CONSUMER = 'DELIVERED_TO_CONSUMER',
  PROCESSING = 'PROCESSING',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  REDELIVERED = 'REDELIVERED',
  DEAD_LETTERED = 'DEAD_LETTERED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export interface VaatiTenant {
  id: string;
  name: string;
  status: VaatiTenantStatus;
  rateLimitPerMinute: number;
  maxQueues: number;
  maxPayloadBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VaatiApiKey {
  id: string;
  tenantId: string;
  keyHash: string;
  keyPrefix: string;
  role: VaatiRole;
  allowedExchanges: string[];
  allowedQueues: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

export interface VaatiExchange {
  id: string;
  tenantId: string;
  name: string;
  type: VaatiExchangeType;
  durable: boolean;
  autoDelete: boolean;
  createdAt: Date;
}

export interface VaatiQueue {
  id: string;
  tenantId: string;
  name: string;
  durable: boolean;
  priority: boolean;
  maxAttempts: number;
  messageTtlMs: number;
  deadLetterExchange: string | null;
  deadLetterRoutingKey: string | null;
  state: VaatiQueueState;
  concurrencyLimit: number;
  createdAt: Date;
}

export interface VaatiBinding {
  id: string;
  tenantId: string;
  exchangeName: string;
  queueName: string;
  bindingKey: string;
  headerRules: Record<string, any> | null;
  createdAt: Date;
}

export interface VaatiMessage {
  id: string;
  tenantId: string;
  exchangeName: string;
  routingKey: string;
  correlationId: string | null;
  causationId: string | null;
  idempotencyKey: string | null;
  headers: Record<string, any>;
  payload: any;
  priority: number;
  ttlMs: number | null;
  maxAttempts: number;
  attemptsMade: number;
  status: VaatiMessageStatus;
  errorSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VaatiDeadLetter {
  id: string;
  tenantId: string;
  messageId: string;
  originalQueue: string;
  originalExchange: string;
  routingKey: string;
  payload: any;
  headers: Record<string, any> | null;
  failureReason: string;
  stackTrace: string | null;
  redeliveryCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  replayed: boolean;
  replayedAt: Date | null;
  createdAt: Date;
}

export interface VaatiAuditLog {
  id: number;
  tenantId: string;
  actorId: string;
  actorRole: VaatiRole;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, any> | null;
  ipAddress: string | null;
  timestamp: Date;
}

export interface VaatiAuthContext {
  tenantId: string;
  actorId: string;
  actorRole: VaatiRole;
  apiKeyId: string | null;
  allowedExchanges: string[];
  allowedQueues: string[];
}
