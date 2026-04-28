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
});
