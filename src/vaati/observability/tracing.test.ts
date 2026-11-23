import {
  extractOrCreateTraceparent,
  generateTraceparent,
  injectTraceparent,
} from '@waha/vaati/observability/tracing.utils';

describe('W3C Tracing Utilities', () => {
  test('generates valid W3C traceparent string', () => {
    const traceparent = generateTraceparent();
    const parts = traceparent.split('-');

    expect(parts.length).toBe(4);
    expect(parts[0]).toBe('00'); // Version
    expect(parts[1].length).toBe(32); // 16-byte hex trace ID
    expect(parts[2].length).toBe(16); // 8-byte hex span ID
    expect(parts[3]).toBe('01'); // Sampled flag
  });

  test('extracts existing traceparent when present in headers', () => {
    const existing = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const extracted = extractOrCreateTraceparent({ traceparent: existing });

    expect(extracted).toBe(existing);
  });

  test('generates new traceparent when headers do not contain one', () => {
    const created = extractOrCreateTraceparent({});
    expect(created.startsWith('00-')).toBe(true);
  });

  test('injects traceparent into headers object', () => {
    const headers: Record<string, any> = { 'content-type': 'application/json' };
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

    injectTraceparent(headers, traceparent);
    expect(headers['traceparent']).toBe(traceparent);
  });
});
