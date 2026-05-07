import { existsSync, readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Paths } from '@/shared-kernel/config/paths.js';
import { loadConfig } from '@/shared-kernel/config/loader.js';
import { FileCache } from '@/shared-kernel/cache/FileCache.js';
import { RedisCache, type RedisLikeClient } from '@/shared-kernel/cache/RedisCache.js';

export interface CacheClearOptions {
  profile?: string;
  config?: string;
  context?: string;
}

type DomainContext =
  | 'courses'
  | 'grades'
  | 'assignments'
  | 'content'
  | 'comms'
  | 'calendar';

const CONTEXT_TO_PREFIX: Record<DomainContext, string> = {
  courses: 'courses:',
  grades: 'grades:',
  assignments: 'assignments:',
  content: 'content:',
  comms: 'comms:',
  calendar: 'calendar:',
};

function readConfigOrNull(path: string): ReturnType<typeof loadConfig> | null {
  if (!existsSync(path)) return null;
  try {
    return loadConfig({ fileContent: readFileSync(path, 'utf8'), env: process.env, cliOverrides: {} });
  } catch {
    return null;
  }
}

function makeRedisLoader(url: string): () => Promise<RedisLikeClient> {
  let p: Promise<RedisLikeClient> | null = null;
  return () => {
    if (!p) {
      p = (async () => {
        const ioredis = await import('ioredis').catch(() => {
          throw new Error('ioredis is not installed');
        });
        return new ioredis.Redis(url) as unknown as RedisLikeClient;
      })();
    }
    return p;
  };
}

function isKnownContext(c: string): c is DomainContext {
  return c in CONTEXT_TO_PREFIX;
}

export async function runCacheClear(opts: CacheClearOptions): Promise<void> {
  const cleared: string[] = [];
  const configPath = opts.config ?? Paths.configYaml();
  const config = readConfigOrNull(configPath);

  if (opts.context && !isKnownContext(opts.context)) {
    process.stderr.write(
      `Unknown context "${opts.context}". Valid: ${Object.keys(CONTEXT_TO_PREFIX).join(', ')}.\n`,
    );
    return;
  }

  // Domain cache — persistent layer. Redis if configured, otherwise the
  // shared FileCache that composition-root writes to.
  if (config?.redis) {
    const loader = makeRedisLoader(config.redis.url);
    const cache = new RedisCache({
      loader,
      keyPrefix: `${config.redis.key_prefix}domain:`,
    });
    try {
      if (opts.context && isKnownContext(opts.context)) {
        await cache.clear(CONTEXT_TO_PREFIX[opts.context]);
        cleared.push(`redis:${opts.context}`);
      } else {
        await cache.clear();
        cleared.push('redis:domain');
      }
      try {
        const client = await loader();
        await client.quit();
      } catch {
        /* best-effort */
      }
    } catch (err) {
      process.stderr.write(
        `Warning: failed to clear redis cache: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  } else if (existsSync(Paths.domainCacheJson())) {
    const cache = new FileCache({ path: Paths.domainCacheJson() });
    if (opts.context && isKnownContext(opts.context)) {
      await cache.clear(CONTEXT_TO_PREFIX[opts.context]);
      cleared.push(`file:${opts.context}`);
    } else {
      await cache.clear();
      cleared.push('file:domain');
    }
  }

  // Idempotency + sessions — clear only on a full sweep (no context filter).
  if (!opts.context) {
    if (config?.redis) {
      const loader = makeRedisLoader(config.redis.url);
      const cache = new RedisCache({
        loader,
        keyPrefix: `${config.redis.key_prefix}idm:`,
      });
      try {
        await cache.clear();
        cleared.push('redis:idempotency');
        const client = await loader();
        await client.quit();
      } catch {
        /* best-effort */
      }
    } else if (existsSync(Paths.idempotencyJson())) {
      await unlink(Paths.idempotencyJson()).catch(() => {});
      cleared.push('file:idempotency');
    }

    if (existsSync(Paths.sessionsJson())) {
      await unlink(Paths.sessionsJson()).catch(() => {});
      cleared.push('file:sessions');
    }
  }

  const summary = cleared.length > 0
    ? `Cleared: ${cleared.join(', ')}`
    : 'Nothing to clear (no persistent cache found).';
  process.stdout.write(`${summary}\n`);
}
