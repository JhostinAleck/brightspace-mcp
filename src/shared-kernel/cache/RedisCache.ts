import type { Cache } from './Cache.js';

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<string>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: string, ...args: string[]): Promise<[string, string[]]>;
  quit(): Promise<void>;
}

export interface RedisCacheOptions {
  loader: () => Promise<RedisLikeClient>;
  keyPrefix: string;
}

export class RedisCache implements Cache {
  private clientPromise: Promise<RedisLikeClient> | null = null;

  constructor(private readonly opts: RedisCacheOptions) {}

  private async client(): Promise<RedisLikeClient> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        try {
          return await this.opts.loader();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `ioredis is not available (${message}). Install the optional "ioredis" dependency or switch to memory/file cache backend.`,
            { cause: err },
          );
        }
      })();
    }
    return this.clientPromise;
  }

  private fullKey(key: string): string {
    return `${this.opts.keyPrefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const client = await this.client();
    const raw = await client.get(this.fullKey(key));
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const client = await this.client();
    await client.set(this.fullKey(key), JSON.stringify(value), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    const client = await this.client();
    await client.del(this.fullKey(key));
  }

  /**
   * Clear keys by prefix. Uses non-blocking SCAN with a bounded COUNT and
   * variadic DEL to avoid the production hazards of `KEYS *`.
   */
  async clear(prefix?: string): Promise<void> {
    const client = await this.client();
    const pattern = `${this.opts.keyPrefix}${prefix ?? ''}*`;
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', '500');
      cursor = next;
      if (keys.length > 0) {
        // Variadic DEL — single round-trip per batch.
        await client.del(...keys);
      }
    } while (cursor !== '0');
  }
}
