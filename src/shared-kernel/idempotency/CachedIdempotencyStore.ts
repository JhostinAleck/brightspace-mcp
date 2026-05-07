import type { Cache } from '@/shared-kernel/cache/Cache.js';
import type { IdempotencyStore } from './IdempotencyStore.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Idempotency keys are namespaced with the underlying cache's `keyPrefix`
 * (e.g. Redis `${redis.key_prefix}idm:` or the dedicated FileCache file).
 * Adding another `idm:` prefix here would just duplicate the namespace, so
 * we leave the key as-is and rely on the cache wiring for tenant isolation.
 */
export class CachedIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly cache: Cache,
    private readonly defaultTtlMs = DEFAULT_TTL_MS,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    return this.cache.get<T>(key);
  }

  async put<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.cache.set(key, value, ttlMs ?? this.defaultTtlMs);
  }
}
