import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { FileCache } from '@/shared-kernel/cache/FileCache.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';

export interface CacheClearOptions {
  profile?: string;
  config?: string;
  context?: string;
}

export async function runCacheClear(opts: CacheClearOptions): Promise<void> {
  // Always clear the in-memory cache (no-op if nothing to clear).
  const memory = new InMemoryCache();
  await memory.clear(opts.context);

  // If a persistent cache file exists at the default location, clear it too.
  const fileCachePath = join(homedir(), '.brightspace-mcp', 'cache.json');
  if (existsSync(fileCachePath)) {
    const fileCache = new FileCache({ path: fileCachePath });
    await fileCache.clear(opts.context);
  }

  const scope = opts.context ? `context=${opts.context}` : 'all contexts';
  process.stdout.write(`Cleared cache (${scope}).\n`);
}
