import { describe, expect, it } from 'vitest';

import { Disposables } from '@/shared-kernel/lifecycle/Disposables.js';

describe('Disposables', () => {
  it('runs disposers in LIFO order', async () => {
    const order: number[] = [];
    const d = new Disposables();
    d.add(async () => { order.push(1); });
    d.add(async () => { order.push(2); });
    d.add(async () => { order.push(3); });
    expect(d.size()).toBe(3);
    await d.disposeAll();
    expect(order).toEqual([3, 2, 1]);
    expect(d.size()).toBe(0);
  });

  it('continues running disposers when one throws and routes errors to onError', async () => {
    const errors: unknown[] = [];
    const calls: string[] = [];
    const d = new Disposables();
    d.add(async () => { calls.push('first'); });
    d.add(async () => { throw new Error('boom'); });
    d.add(async () => { calls.push('third'); });
    await d.disposeAll((err) => errors.push(err));
    // Third runs first (LIFO), then the throwing one is captured, then first.
    expect(calls).toEqual(['third', 'first']);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
  });

  it('is idempotent: calling disposeAll twice is a no-op the second time', async () => {
    let calls = 0;
    const d = new Disposables();
    d.add(async () => { calls++; });
    await d.disposeAll();
    await d.disposeAll();
    expect(calls).toBe(1);
  });
});
