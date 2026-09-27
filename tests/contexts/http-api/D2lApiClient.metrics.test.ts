import { afterEach, describe, expect, it } from 'vitest';
import nock from 'nock';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache.js';

const BASE = 'https://x.com';

afterEach(() => nock.cleanAll());

/**
 * D2lApiClient is meant to feed MetricsRegistry so the get_diagnostics MCP
 * tool reports real numbers. Before this wiring landed the diagnostics
 * payload was always empty maps — so these tests exist to keep the
 * instrumentation honest if anyone refactors the middleware chain.
 */
describe('D2lApiClient → MetricsRegistry', () => {
  it('observes http.duration_ms, http.status.* and http.cache.miss on a fresh GET', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/foo').reply(200, { ok: true });
    const metrics = new MetricsRegistry();
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      cache: new HttpResponseCache(new InMemoryCache()),
      cacheTtlMs: 60_000,
      metrics,
    });
    await client.get('/d2l/api/lp/1.56/foo');
    const snap = metrics.snapshot();
    expect(snap.counters['http.cache.miss']).toBe(1);
    expect(snap.counters['http.status.200']).toBe(1);
    expect(snap.durations['http.duration_ms']?.count).toBe(1);
  });

  it('emits http.cache.hit when the second call is served from cache (no second status counter)', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/foo').reply(200, { ok: true });
    const metrics = new MetricsRegistry();
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      cache: new HttpResponseCache(new InMemoryCache()),
      cacheTtlMs: 60_000,
      metrics,
    });
    await client.get('/d2l/api/lp/1.56/foo');
    await client.get('/d2l/api/lp/1.56/foo');
    const snap = metrics.snapshot();
    expect(snap.counters['http.cache.miss']).toBe(1);
    expect(snap.counters['http.cache.hit']).toBe(1);
    // Only one upstream fetch happened.
    expect(snap.counters['http.status.200']).toBe(1);
  });

  it('emits http.network_error on connection failures', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/down').replyWithError('ECONNREFUSED');
    const metrics = new MetricsRegistry();
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      metrics,
    });
    await expect(client.get('/d2l/api/lp/1.56/down')).rejects.toThrow();
    const snap = metrics.snapshot();
    expect(snap.counters['http.network_error']).toBe(1);
  });

  it('emits http.status.5xx for upstream server errors', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/boom').reply(503, 'service down');
    const metrics = new MetricsRegistry();
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      metrics,
    });
    await expect(client.get('/d2l/api/lp/1.56/boom')).rejects.toThrow();
    const snap = metrics.snapshot();
    expect(snap.counters['http.status.503']).toBe(1);
  });

  it('emits a circuit.open counter when the breaker trips', async () => {
    // Three 503s in a row will trip the breaker (failureThreshold=2).
    nock(BASE).get('/d2l/api/lp/1.56/boom').times(3).reply(503, 'down');
    const metrics = new MetricsRegistry();
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      circuit: { failureThreshold: 2, resetTimeoutMs: 60_000 },
      metrics,
    });
    await expect(client.get('/d2l/api/lp/1.56/boom')).rejects.toThrow();
    await expect(client.get('/d2l/api/lp/1.56/boom')).rejects.toThrow();
    await expect(client.get('/d2l/api/lp/1.56/boom')).rejects.toThrow();
    const snap = metrics.snapshot();
    // Breaker opened at least once; subsequent calls short-circuit.
    expect(snap.counters['circuit.open']).toBeGreaterThanOrEqual(1);
  });

  it('does NOT trip the breaker on repeated 404s (a topic with no attached file is not an infra failure)', async () => {
    // Same failureThreshold=2 as the 5xx test above — if 404s counted the
    // same as 503s this would trip on the 2nd call. They must not.
    nock(BASE).get('/d2l/api/le/1.56/missing').times(3).reply(404, 'not found');
    const metrics = new MetricsRegistry();
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      circuit: { failureThreshold: 2, resetTimeoutMs: 60_000 },
      metrics,
    });
    await expect(client.get('/d2l/api/le/1.56/missing')).rejects.toThrow();
    await expect(client.get('/d2l/api/le/1.56/missing')).rejects.toThrow();
    await expect(client.get('/d2l/api/le/1.56/missing')).rejects.toThrow();
    const snap = metrics.snapshot();
    expect(snap.counters['circuit.open']).toBeUndefined();
    // And the breaker being closed means each call actually reached nock,
    // not short-circuited — status.404 fires 3 times, once per call.
    expect(snap.counters['http.status.404']).toBe(3);
  });

  it('still trips the breaker for 404s mixed with real 5xx failures', async () => {
    nock(BASE).get('/d2l/api/le/1.56/flaky').reply(404, 'not found');
    nock(BASE).get('/d2l/api/le/1.56/flaky').times(2).reply(503, 'down');
    const metrics = new MetricsRegistry();
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      circuit: { failureThreshold: 2, resetTimeoutMs: 60_000 },
      metrics,
    });
    // 404 first — must not count toward the threshold.
    await expect(client.get('/d2l/api/le/1.56/flaky')).rejects.toThrow();
    // Two real 503s in a row should still trip it.
    await expect(client.get('/d2l/api/le/1.56/flaky')).rejects.toThrow();
    await expect(client.get('/d2l/api/le/1.56/flaky')).rejects.toThrow();
    const snap = metrics.snapshot();
    expect(snap.counters['circuit.open']).toBeGreaterThanOrEqual(1);
  });
});
