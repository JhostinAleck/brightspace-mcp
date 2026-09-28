import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withFileLock } from '@/shared-kernel/fs/fileLock';

let dir: string;
let target: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-'));
  target = join(dir, 'data.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('withFileLock', () => {
  it('serializes concurrent operations on the same file', async () => {
    const events: string[] = [];
    const op = (name: string) => async () => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
      return name;
    };
    const results = await Promise.all([withFileLock(target, op('a')), withFileLock(target, op('b'))]);
    expect(results).toEqual(['a', 'b']);
    // Whoever wins the race, the two critical sections never interleave.
    expect([['a:start', 'a:end', 'b:start', 'b:end'], ['b:start', 'b:end', 'a:start', 'a:end']]).toContainEqual(events);
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it('releases the lock when the operation throws', async () => {
    await expect(withFileLock(target, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it('gives up with ELOCKED while another holder keeps the lock', async () => {
    mkdirSync(`${target}.lock`);
    await expect(withFileLock(target, async () => 'x', { retries: 2, minTimeoutMs: 1 }))
      .rejects.toMatchObject({ code: 'ELOCKED' });
  });

  it('reclaims a stale lock left by a crashed process', async () => {
    mkdirSync(`${target}.lock`);
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${target}.lock`, old, old);
    expect(await withFileLock(target, async () => 'ok', { retries: 0 })).toBe('ok');
  });

  it('surfaces unexpected filesystem errors', async () => {
    await expect(withFileLock(join(dir, 'missing', 'data.json'), async () => 'x')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
