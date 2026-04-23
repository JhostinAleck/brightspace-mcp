import { describe, it, expect } from 'vitest';
import { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry';
import { handleGetDiagnostics } from '@/mcp/tools/get-diagnostics.tool';

describe('get_diagnostics tool', () => {
  it('returns a JSON block with counters and durations', async () => {
    const metrics = new MetricsRegistry();
    metrics.inc('cache.hit', 5);
    metrics.observe('http.request', 42);
    const result = await handleGetDiagnostics({
      metrics,
      staticInfo: { profile: 'p', baseUrl: 'https://x', versions: { lp: '1.56', le: '1.91' } },
    }, {});

    const text = result.content[0]?.text ?? '';
    const parsed = JSON.parse(text);
    expect(parsed.profile).toBe('p');
    expect(parsed.baseUrl).toBe('https://x');
    expect(parsed.versions).toEqual({ lp: '1.56', le: '1.91' });
    expect(parsed.counters['cache.hit']).toBe(5);
    expect(parsed.durations['http.request'].count).toBe(1);
  });

  it('handles an empty registry gracefully', async () => {
    const result = await handleGetDiagnostics({
      metrics: new MetricsRegistry(),
      staticInfo: { profile: 'p', baseUrl: 'https://x', versions: { lp: '1', le: '1' } },
    }, {});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.counters).toEqual({});
    expect(parsed.durations).toEqual({});
  });
});
