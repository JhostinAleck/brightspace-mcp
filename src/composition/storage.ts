import type { Config } from '@/shared-kernel/config/schema.js';
import { Paths } from '@/shared-kernel/config/paths.js';
import type { Cache } from '@/shared-kernel/cache/Cache.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import { FileCache } from '@/shared-kernel/cache/FileCache.js';
import { LayeredCache } from '@/shared-kernel/cache/LayeredCache.js';
import { RedisCache, type RedisLikeClient } from '@/shared-kernel/cache/RedisCache.js';
import { CachedIdempotencyStore } from '@/shared-kernel/idempotency/CachedIdempotencyStore.js';

type RedisLoader = () => Promise<RedisLikeClient>;

/**
 * Picks the persistent backing store: Redis (namespaced by `suffix`) when a
 * [redis] section is configured, otherwise a JSON file under ~/.brightspace-mcp.
 */
function persistentCache(
  redis: { config: NonNullable<Config['redis']>; loader: RedisLoader } | null,
  suffix: string,
  filePath: string,
): Cache {
  return redis
    ? new RedisCache({ loader: redis.loader, keyPrefix: `${redis.config.key_prefix}${suffix}` })
    : new FileCache({ path: filePath });
}

export interface Storage {
  /** Memory-over-persistent cache shared by every Cached*Repository. */
  domainCache: LayeredCache;
  idempotencyStore: CachedIdempotencyStore;
}

export function buildStorage(redisConfig: Config['redis'], redisLoader: RedisLoader | null): Storage {
  const redis = redisConfig && redisLoader ? { config: redisConfig, loader: redisLoader } : null;
  return {
    domainCache: new LayeredCache({
      memory: new InMemoryCache(),
      persistent: persistentCache(redis, 'domain:', Paths.domainCacheJson()),
    }),
    idempotencyStore: new CachedIdempotencyStore(
      persistentCache(redis, 'idm:', Paths.idempotencyJson()),
    ),
  };
}
