import { describe, it, expect } from 'vitest';
import { RedisCache, type RedisLikeClient } from '@/shared-kernel/cache/RedisCache';

function makeFakeRedis(): { client: RedisLikeClient; store: Map<string, { v: string; expiresAt: number }> } {
  const store = new Map<string, { v: string; expiresAt: number }>();
  const now = (): number => Date.now();
  const client: RedisLikeClient = {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) { store.delete(key); return null; }
      return entry.v;
    },
    async set(key, value, mode, ttlMs) {
      expect(mode).toBe('PX');
      store.set(key, { v: value, expiresAt: now() + ttlMs });
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

describe('RedisCache', () => {
  it('stores and retrieves a JSON-encoded value', async () => {
    const { client } = makeFakeRedis();
    const cache = new RedisCache({ loader: async () => client, keyPrefix: 'test:' });
    await cache.set('k', { n: 1 }, 10_000);
    expect(await cache.get<{ n: number }>('k')).toEqual({ n: 1 });
  });

  it('isolates by keyPrefix', async () => {
    const { client, store } = makeFakeRedis();
    const cache = new RedisCache({ loader: async () => client, keyPrefix: 'app:' });
    await cache.set('k', 1, 10_000);
    expect([...store.keys()][0]).toBe('app:k');
  });

  it('clear(prefix) deletes matching keys', async () => {
    const { client } = makeFakeRedis();
    const cache = new RedisCache({ loader: async () => client, keyPrefix: 'p:' });
    await cache.set('a:1', 1, 10_000);
    await cache.set('a:2', 2, 10_000);
    await cache.set('b:1', 3, 10_000);
    await cache.clear('a:');
    expect(await cache.get('a:1')).toBeNull();
    expect(await cache.get('b:1')).toBe(3);
  });

  it('clear() without prefix deletes all keys in the prefix namespace', async () => {
    const { client } = makeFakeRedis();
    const cache = new RedisCache({ loader: async () => client, keyPrefix: 'p:' });
    await cache.set('a', 1, 10_000);
    await cache.set('b', 2, 10_000);
    await cache.clear();
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBeNull();
  });

  it('surfaces a helpful error when ioredis cannot be loaded', async () => {
    const cache = new RedisCache({
      loader: async () => { throw new Error('nope'); },
      keyPrefix: 'p:',
    });
    await expect(cache.get('k')).rejects.toThrow(/ioredis|redis/i);
  });
});
