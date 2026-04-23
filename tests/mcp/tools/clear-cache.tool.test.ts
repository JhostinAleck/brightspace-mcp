import { describe, it, expect } from 'vitest';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache';
import { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache';
import { handleClearCache } from '@/mcp/tools/clear-cache.tool';

describe('clear_cache tool', () => {
  it('clears all caches when scope=all (default)', async () => {
    const httpBacking = new InMemoryCache();
    const http = new HttpResponseCache(httpBacking);
    const domain = new InMemoryCache();

    await http.set({ method: 'GET', path: '/x', authFingerprint: 'u' }, 'a', 60_000);
    await domain.set('courses:list:active', ['c'], 60_000);

    const result = await handleClearCache({ httpCache: http, domainCaches: { courses: domain } }, {});

    expect(result.content[0]?.text).toMatch(/cleared/i);
    expect(await http.get({ method: 'GET', path: '/x', authFingerprint: 'u' })).toBeNull();
    expect(await domain.get('courses:list:active')).toBeNull();
  });

  it('clears only http when scope=http', async () => {
    const httpBacking = new InMemoryCache();
    const http = new HttpResponseCache(httpBacking);
    const domain = new InMemoryCache();

    await http.set({ method: 'GET', path: '/x', authFingerprint: 'u' }, 'a', 60_000);
    await domain.set('courses:list:active', ['c'], 60_000);

    await handleClearCache({ httpCache: http, domainCaches: { courses: domain } }, { scope: 'http' });

    expect(await http.get({ method: 'GET', path: '/x', authFingerprint: 'u' })).toBeNull();
    expect(await domain.get('courses:list:active')).toEqual(['c']);
  });

  it('clears only courses when scope=courses', async () => {
    const httpBacking = new InMemoryCache();
    const http = new HttpResponseCache(httpBacking);
    const domain = new InMemoryCache();

    await http.set({ method: 'GET', path: '/x', authFingerprint: 'u' }, 'a', 60_000);
    await domain.set('courses:list:active', ['c'], 60_000);

    await handleClearCache({ httpCache: http, domainCaches: { courses: domain } }, { scope: 'courses' });

    expect(await http.get({ method: 'GET', path: '/x', authFingerprint: 'u' })).toBe('a');
    expect(await domain.get('courses:list:active')).toBeNull();
  });
});
