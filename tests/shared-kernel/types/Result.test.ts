import { describe, it, expect } from 'vitest';
import { type Result, ok, err } from '@/shared-kernel/types/Result';

describe('Result', () => {
  it('ok() creates success', () => {
    const r: Result<number, string> = ok(42);
    expect(r.isOk).toBe(true);
    expect(r.isErr).toBe(false);
    if (r.isOk) expect(r.value).toBe(42);
  });

  it('err() creates failure', () => {
    const r: Result<number, string> = err('boom');
    expect(r.isOk).toBe(false);
    expect(r.isErr).toBe(true);
    if (r.isErr) expect(r.error).toBe('boom');
  });
});
