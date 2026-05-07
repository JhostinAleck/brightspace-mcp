import type { Cache } from '@/shared-kernel/cache/Cache.js';
import type { IdempotencyStore } from './IdempotencyStore.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'idm:';

export class CachedIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly cache: Cache,
    private readonly defaultTtlMs = DEFAULT_TTL_MS,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    return this.cache.get<T>(`${KEY_PREFIX}${key}`);
  }

  async put<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.cache.set(`${KEY_PREFIX}${key}`, value, ttlMs ?? this.defaultTtlMs);
  }
}
