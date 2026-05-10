import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';

const BASE = 'https://sandbox.d2l.com';

describe('D2lApiClient.get', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('sends Authorization header and parses JSON', async () => {
    nock(BASE)
      .get('/d2l/api/lp/1.56/users/whoami')
      .matchHeader('authorization', 'Bearer tok_abc')
      .reply(200, { Identifier: '99', DisplayName: 'Test', UniqueName: 'test@x' });

    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('tok_abc'),
    });
    const body = await client.get<{ DisplayName: string }>('/d2l/api/lp/1.56/users/whoami');
    expect(body.DisplayName).toBe('Test');
  });

  it('throws D2lApiError on non-2xx', async () => {
    nock(BASE).get('/bad').reply(500, 'oops');
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
    });
    await expect(client.get('/bad')).rejects.toMatchObject({ code: 'HTTP_500' });
  });

  it('rejects http:// base URLs', () => {
    expect(
      () =>
        new D2lApiClient({
          baseUrl: 'http://insecure',
          getToken: async () => AccessToken.bearer('t'),
        }),
    ).toThrow();
  });

  it('retries on 5xx and eventually returns body', async () => {
    nock(BASE).get('/flaky').reply(503, 'nope');
    nock(BASE).get('/flaky').reply(200, { ok: true });

    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      retry: { maxAttempts: 3, initialMs: 1, maxMs: 10 },
    });
    const body = await client.get<{ ok: boolean }>('/flaky');
    expect(body.ok).toBe(true);
  });

  it('does not retry on 4xx (except 401/429)', async () => {
    nock(BASE).get('/bad').reply(400, 'bad request');

    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      retry: { maxAttempts: 3, initialMs: 1, maxMs: 10 },
    });
    await expect(client.get('/bad')).rejects.toMatchObject({ code: 'HTTP_400' });
  });

  it('returns cached response on second call within TTL', async () => {
    nock(BASE).get('/cached').reply(200, { n: 1 });

    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      cacheTtlMs: 60_000,
    });
    const a = await client.get<{ n: number }>('/cached');
    const b = await client.get<{ n: number }>('/cached');
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(nock.isDone()).toBe(true);
  });

  it('throws RateLimitedError on 429 with Retry-After', async () => {
    nock(BASE).get('/throttled').reply(429, 'stop', { 'retry-after': '2' });

    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      retry: { maxAttempts: 1, initialMs: 1, maxMs: 10 },
    });
    await expect(client.get('/throttled')).rejects.toMatchObject({
      code: 'HTTP_429',
      retryAfterMs: 2000,
    });
  });

  it('does not expose raw token in coalescer key — two users get isolated results', async () => {
    // Two different tokens must NOT share coalesced results
    nock(BASE).get('/data').reply(200, { user: 'alice' });
    nock(BASE).get('/data').reply(200, { user: 'bob' });

    let call = 0;
    const tokens = ['tok_alice', 'tok_bob'];
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer(tokens[call++ % 2]!),
    });

    const [a, b] = await Promise.all([
      client.get<{ user: string }>('/data'),
      client.get<{ user: string }>('/data'),
    ]);

    // Both requests should complete; if coalescer key leaks raw token they'd collide
    expect(new Set([a.user, b.user]).size).toBe(2);
  });
});

describe('D2lApiClient.auto-refresh on AuthExpiredError', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('retries the request once with a fresh token after 401', async () => {
    // First call: 401. Second call (after refresh): 200.
    nock(BASE).get('/data').reply(401, 'Unauthorized');
    nock(BASE).get('/data').reply(200, { ok: true });

    let tokenSerial = 0;
    let refreshCalls = 0;
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer(`tok_${tokenSerial}`),
      onAuthFailure: async () => {
        refreshCalls++;
        tokenSerial++;
        return AccessToken.bearer(`tok_${tokenSerial}`);
      },
    });

    const result = await client.get<{ ok: boolean }>('/data');
    expect(result.ok).toBe(true);
    expect(refreshCalls).toBe(1);
  });

  it('debounces concurrent 401s to a single refresh call', async () => {
    nock(BASE).get('/a').reply(401, '');
    nock(BASE).get('/b').reply(401, '');
    nock(BASE).get('/a').reply(200, { name: 'a' });
    nock(BASE).get('/b').reply(200, { name: 'b' });

    let refreshCalls = 0;
    let tokenSerial = 0;
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer(`t${tokenSerial}`),
      onAuthFailure: async () => {
        refreshCalls++;
        // Slow refresh so the second concurrent caller has to wait for it.
        await new Promise((r) => setTimeout(r, 30));
        tokenSerial++;
        return AccessToken.bearer(`t${tokenSerial}`);
      },
    });

    const [a, b] = await Promise.all([
      client.get<{ name: string }>('/a'),
      client.get<{ name: string }>('/b'),
    ]);
    expect(a.name).toBe('a');
    expect(b.name).toBe('b');
    expect(refreshCalls).toBe(1); // not 2
  });

  it('lets AuthExpiredError bubble when no onAuthFailure is configured', async () => {
    nock(BASE).get('/x').reply(401, 'expired');
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
    });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
  });
});
