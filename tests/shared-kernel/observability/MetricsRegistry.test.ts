import { describe, it, expect } from 'vitest';
import { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry';

describe('MetricsRegistry', () => {
  it('increments counters', () => {
    const m = new MetricsRegistry();
    m.inc('cache.hit');
    m.inc('cache.hit');
    m.inc('cache.miss');
    const snap = m.snapshot();
    expect(snap.counters['cache.hit']).toBe(2);
    expect(snap.counters['cache.miss']).toBe(1);
  });

  it('records durations and returns min/max/avg/p95', () => {
    const m = new MetricsRegistry();
    for (let i = 1; i <= 100; i++) m.observe('http.request', i);
    const snap = m.snapshot();
    const stats = snap.durations['http.request'];
    expect(stats).toBeDefined();
    expect(stats!.count).toBe(100);
    expect(stats!.min).toBe(1);
    expect(stats!.max).toBe(100);
    expect(stats!.avg).toBeCloseTo(50.5);
    expect(stats!.p95).toBeGreaterThanOrEqual(95);
  });

  it('snapshot is a fresh copy (mutating it does not affect registry)', () => {
    const m = new MetricsRegistry();
    m.inc('x');
    const snap = m.snapshot();
    snap.counters['x'] = 999;
    const again = m.snapshot();
    expect(again.counters['x']).toBe(1);
  });
});
