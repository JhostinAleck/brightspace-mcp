import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CachedIdempotencyStore } from '@/shared-kernel/idempotency/CachedIdempotencyStore.js';
import { FileCache } from '@/shared-kernel/cache/FileCache.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';

describe('CachedIdempotencyStore (in-memory backing)', () => {
  it('stores and retrieves a value', async () => {
    const store = new CachedIdempotencyStore(new InMemoryCache());
    await store.put('k1', { ok: true });
    expect(await store.get('k1')).toEqual({ ok: true });
  });

  it('returns null for unknown key', async () => {
    const store = new CachedIdempotencyStore(new InMemoryCache());
    expect(await store.get('missing')).toBeNull();
  });

  it('respects explicit TTL — expired entries return null', async () => {
    const cache = new InMemoryCache();
    const store = new CachedIdempotencyStore(cache);
    await store.put('k', { v: 1 }, 1);           // 1 ms TTL
    await new Promise((r) => setTimeout(r, 10));  // let it expire
    expect(await store.get('k')).toBeNull();
  });
});

describe('CachedIdempotencyStore (FileCache backing — survives restart)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'idm-'));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it('persists value so a second instance reads it back', async () => {
    const path = join(dir, 'idempotency.json');

    const storeA = new CachedIdempotencyStore(new FileCache({ path }));
    await storeA.put('req-123', { submitted: true, fileId: 'f9' });

    // Simulate restart — new instance, same file
    const storeB = new CachedIdempotencyStore(new FileCache({ path }));
    const result = await storeB.get<{ submitted: boolean; fileId: string }>('req-123');

    expect(result?.submitted).toBe(true);
    expect(result?.fileId).toBe('f9');
  });

  it('does not return a persisted entry after TTL expires', async () => {
    const path = join(dir, 'idempotency.json');
    const storeA = new CachedIdempotencyStore(new FileCache({ path }));
    await storeA.put('req-old', { v: 1 }, 1);    // 1 ms TTL
    await new Promise((r) => setTimeout(r, 10));

    const storeB = new CachedIdempotencyStore(new FileCache({ path }));
    expect(await storeB.get('req-old')).toBeNull();
  });
});
