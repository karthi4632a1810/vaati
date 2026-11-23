import * as crypto from 'node:crypto';

/**
 * W3C Trace Context Specification (Traceparent)
 * Format: {version}-{trace-id}-{parent-id/span-id}-{trace-flags}
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export function generateTraceparent(): string {
  const version = '00';
  const traceId = crypto.randomBytes(16).toString('hex');
  const spanId = crypto.randomBytes(8).toString('hex');
  const flags = '01'; // sampled
  return `${version}-${traceId}-${spanId}-${flags}`;
}

export function extractOrCreateTraceparent(headers?: Record<string, any>): string {
  if (!headers) {
    return generateTraceparent();
  }
  const existing = headers['traceparent'] || headers['Traceparent'] || headers['TRACEPARENT'];
  if (existing && typeof existing === 'string') {
    return existing;
  }
  return generateTraceparent();
}

export function injectTraceparent(headers: Record<string, any>, traceparent: string): void {
  headers['traceparent'] = traceparent;
}
