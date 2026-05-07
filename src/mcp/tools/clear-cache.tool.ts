import type { Cache } from '@/shared-kernel/cache/Cache.js';
import type { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache.js';
import { clearCacheSchema } from '@/mcp/schemas.js';

export type DomainCacheContext =
  | 'courses'
  | 'grades'
  | 'assignments'
  | 'content'
  | 'communications'
  | 'calendar';

// The communications repo writes under `comms:` for terseness; the others
// match the MCP-facing scope names. We expose the long-form `communications`
// at the API boundary and translate to the storage prefix here.
const DOMAIN_PREFIX: Record<DomainCacheContext, string> = {
  courses: 'courses:',
  grades: 'grades:',
  assignments: 'assignments:',
  content: 'content:',
  communications: 'comms:',
  calendar: 'calendar:',
};

export interface ClearCacheDeps {
  httpCache?: HttpResponseCache;
  domainCaches: Partial<Record<DomainCacheContext, Cache>>;
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

  const targets: DomainCacheContext[] = input.scope === 'all'
    ? (Object.keys(DOMAIN_PREFIX) as DomainCacheContext[])
    : input.scope === 'http'
      ? []
      : [input.scope];

  for (const ctx of targets) {
    const cache = deps.domainCaches[ctx];
    if (!cache) continue;
    await cache.clear(DOMAIN_PREFIX[ctx]);
    cleared.push(ctx);
  }

  const summary = cleared.length > 0 ? `Cleared ${cleared.join(', ')}.` : 'No caches to clear.';
  return { content: [{ type: 'text' as const, text: summary }] };
}
