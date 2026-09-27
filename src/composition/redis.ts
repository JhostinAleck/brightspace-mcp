import type { Config } from '@/shared-kernel/config/schema.js';
import type { Disposables } from '@/shared-kernel/lifecycle/Disposables.js';
import type { RedisLikeClient } from '@/shared-kernel/cache/RedisCache.js';

/**
 * Single Redis client per build. Previously each consumer
 * (sessions, domain cache, idempotency) called `buildRedisLoader` on the
 * same config separately, opening N connections and exposing N orphaned
 * sockets on shutdown. Now we share one connection and register a single
 * `quit()` disposer.
 */
export function makeSharedRedisLoader(
  redisConfig: NonNullable<Config['redis']>,
  disposables: Disposables,
): () => Promise<RedisLikeClient> {
  let clientPromise: Promise<RedisLikeClient> | null = null;
  return () => {
    if (!clientPromise) {
      clientPromise = (async () => {
        const ioredis = await import('ioredis').catch(() => {
          throw new Error('ioredis is not installed. Run: npm install ioredis');
        });
        const client = new ioredis.Redis(redisConfig.url) as unknown as RedisLikeClient;
        disposables.add(async () => {
          try {
            await client.quit();
          } catch {
            /* best-effort */
          }
        });
        return client;
      })();
    }
    return clientPromise;
  };
}
