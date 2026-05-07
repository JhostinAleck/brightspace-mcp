export interface IdempotencyStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, ttlMs?: number): Promise<void>;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export interface InMemoryIdempotencyStoreOptions {
  clock?: () => number;
  defaultTtlMs?: number;
}

/**
 * In-memory idempotency store. Production wiring uses
 * `CachedIdempotencyStore` over a persistent backing cache (Redis or file)
 * so replays survive process restarts. This implementation is kept as a
 * lightweight test seam.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly clock: () => number;
  private readonly entries = new Map<string, Entry>();
  private readonly defaultTtlMs: number;

  constructor(opts: InMemoryIdempotencyStoreOptions = {}) {
    this.clock = opts.clock ?? ((): number => Date.now());
    this.defaultTtlMs = opts.defaultTtlMs ?? 24 * 60 * 60 * 1000;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async put<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.entries.set(key, { value, expiresAt: this.clock() + ttl });
  }
}
