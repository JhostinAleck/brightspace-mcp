import { describe, expect, it } from 'vitest';

import {
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from '@/shared-kernel/idempotency/IdempotencyStore.js';
import { createIdempotencyKey } from '@/shared-kernel/idempotency/IdempotencyKey.js';

describe('createIdempotencyKey', () => {
  it('accepts a valid key', () => {
    const key = createIdempotencyKey('valid-key-1234');
    expect(key).toBe('valid-key-1234');
  });
  it('throws when key is too short', () => {
    expect(() => createIdempotencyKey('short')).toThrow(/8/);
  });
  it('throws when key is too long', () => {
    expect(() => createIdempotencyKey('x'.repeat(129))).toThrow(/128/);
  });
});

describe('InMemoryIdempotencyStore', () => {
  it('returns null when key not seen before', async () => {
    const store: IdempotencyStore = new InMemoryIdempotencyStore();
    const result = await store.get('unseen-key');
    expect(result).toBeNull();
  });

  it('stores and retrieves a response by key', async () => {
    const store: IdempotencyStore = new InMemoryIdempotencyStore();
    await store.put('k1', { ok: true, id: 42 });
    const result = await store.get('k1');
    expect(result).toEqual({ ok: true, id: 42 });
  });

  it('distinct keys are isolated', async () => {
    const store: IdempotencyStore = new InMemoryIdempotencyStore();
    await store.put('a', { v: 1 });
    await store.put('b', { v: 2 });
    expect(await store.get('a')).toEqual({ v: 1 });
    expect(await store.get('b')).toEqual({ v: 2 });
  });

  it('respects TTL — expired entries return null', async () => {
    let now = 1000;
    const store = new InMemoryIdempotencyStore({ clock: () => now });
    await store.put('k', { v: 'x' }, 500);
    expect(await store.get('k')).toEqual({ v: 'x' });
    now = 2000; // jump clock forward past TTL
    expect(await store.get('k')).toBeNull();
  });
});
