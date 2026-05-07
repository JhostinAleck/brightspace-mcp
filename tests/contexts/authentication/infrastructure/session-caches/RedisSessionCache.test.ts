import { describe, it, expect } from 'vitest';
import { RedisSessionCache } from '@/contexts/authentication/infrastructure/session-caches/RedisSessionCache.js';
import type { RedisLikeClient } from '@/shared-kernel/cache/RedisCache.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { UserId } from '@/shared-kernel/types/UserId.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';

function makeFakeRedis(): { client: RedisLikeClient; store: Map<string, { v: string; expiresAt: number }> } {
  const store = new Map<string, { v: string; expiresAt: number }>();
  const client: RedisLikeClient = {
    async get(key) {
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= Date.now()) { store.delete(key); return null; }
      return entry.v;
    },
    async set(key, value, _mode, ttlMs) {
      store.set(key, { v: value, expiresAt: Date.now() + ttlMs });
      return 'OK';
    },
    async del(key) { return store.delete(key) ? 1 : 0; },
    async keys(pattern) {
      const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return [...store.keys()].filter((k) => re.test(k));
    },
    async quit() {},
  };
  return { client, store };
}

const makeSession = (profile: string, expiresAt: Date): Session => ({
  token: AccessToken.bearer('test-token'),
  profile,
  issuedAt: new Date(0),
  expiresAt,
  source: 'api_token',
  userIdentity: { userId: UserId.of(99), displayName: 'Test User', uniqueName: 'test@x.com' },
});

describe('RedisSessionCache', () => {
  it('saves and retrieves a valid session', async () => {
    const { client } = makeFakeRedis();
    const cache = new RedisSessionCache({ loader: async () => client, keyPrefix: 'bsp:' });

    await cache.save('prof1', makeSession('prof1', new Date(Date.now() + 60_000)));
    const session = await cache.get('prof1');

    expect(session?.token.reveal()).toBe('test-token');
    expect(session?.profile).toBe('prof1');
    expect(session?.userIdentity.displayName).toBe('Test User');
  });

  it('returns null for an expired session', async () => {
    const { client } = makeFakeRedis();
    const cache = new RedisSessionCache({ loader: async () => client, keyPrefix: 'bsp:' });

    await cache.save('p', makeSession('p', new Date(Date.now() - 1)));
    expect(await cache.get('p')).toBeNull();
  });

  it('skips saving a session that is already expired', async () => {
    const { client, store } = makeFakeRedis();
    const cache = new RedisSessionCache({ loader: async () => client, keyPrefix: 'bsp:' });

    await cache.save('p', makeSession('p', new Date(Date.now() - 1)));
    expect(store.size).toBe(0);
  });

  it('invalidate removes the session', async () => {
    const { client } = makeFakeRedis();
    const cache = new RedisSessionCache({ loader: async () => client, keyPrefix: 'bsp:' });

    await cache.save('p', makeSession('p', new Date(Date.now() + 60_000)));
    await cache.invalidate('p');
    expect(await cache.get('p')).toBeNull();
  });

  it('uses the configured key prefix', async () => {
    const { client, store } = makeFakeRedis();
    const cache = new RedisSessionCache({ loader: async () => client, keyPrefix: 'myapp:' });

    await cache.save('p', makeSession('p', new Date(Date.now() + 60_000)));
    expect([...store.keys()][0]).toBe('myapp:session:p');
  });

  it('surfaces a helpful error when ioredis cannot be loaded', async () => {
    const cache = new RedisSessionCache({
      loader: async () => { throw new Error('module not found'); },
      keyPrefix: 'bsp:',
    });
    await expect(cache.get('p')).rejects.toThrow(/ioredis/i);
  });
});
