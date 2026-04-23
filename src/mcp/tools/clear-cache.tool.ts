import type { Cache } from '@/shared-kernel/cache/Cache.js';
import type { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache.js';
import { clearCacheSchema } from '@/mcp/schemas.js';

export interface ClearCacheDeps {
  httpCache?: HttpResponseCache;
  domainCaches: Partial<Record<'courses', Cache>>;
}

export async function handleClearCache(deps: ClearCacheDeps, rawInput: unknown) {
  const input = clearCacheSchema.parse(rawInput);
  const cleared: string[] = [];
  if (input.scope === 'all' || input.scope === 'http') {
    if (deps.httpCache) {
      await deps.httpCache.clearAll();
      cleared.push('http');
    }
  }
  if (input.scope === 'all' || input.scope === 'courses') {
    if (deps.domainCaches.courses) {
      await deps.domainCaches.courses.clear('courses:');
      cleared.push('courses');
    }
  }
  const summary = cleared.length > 0 ? `Cleared ${cleared.join(', ')}.` : 'No caches to clear.';
  return { content: [{ type: 'text' as const, text: summary }] };
}
