export interface ConsumerMessage {
  messageId: string;
  tenantId: string;
  exchange: string;
  routingKey: string;
  correlationId?: string;
  headers?: Record<string, any>;
  payload: any;
  attemptsMade: number;
}

export type ConsumerHandler = (message: ConsumerMessage) => Promise<any>;

export interface ConsumerSubscription {
  id: string;
  tenantId: string;
  queueName: string;
  targetWebhookUrl?: string;
  internalHandlerName?: string;
  concurrency: number;
  createdAt: Date;
}
