import { describe, it, expect } from 'vitest';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, renameWithRetry } from '@/shared-kernel/fs/atomicWrite';

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'aw-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

function makeFlakyRename(failures: number, code: string) {
  let calls = 0;
  const renameFn = async (_from: string, _to: string): Promise<void> => {
    calls++;
    if (calls <= failures) {
      const err = new Error(`mock ${code}`) as NodeJS.ErrnoException;
      err.code = code;
      throw err;
    }
  };
  return { renameFn, getCalls: () => calls };
}

describe('atomicWrite', () => {
  it('writes data to the target path and round-trips', async () => {
    await withTmpDir(async (dir) => {
      const target = join(dir, 'file.json');
      await atomicWrite(target, JSON.stringify({ hello: 'world' }));
      const text = await readFile(target, 'utf8');
      expect(JSON.parse(text)).toEqual({ hello: 'world' });
    });
  });

  it('cleans up the tmp file when rename fails permanently', async () => {
    await withTmpDir(async (dir) => {
      const target = join(dir, 'file.json');
      const renameFn = async (): Promise<void> => {
        const e = new Error('boom') as NodeJS.ErrnoException;
        e.code = 'ENOSPC';
        throw e;
      };
      await expect(atomicWrite(target, 'x', { renameFn, attempts: 1 })).rejects.toThrow('boom');
      // tmp file must not linger
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(dir);
      expect(entries).toEqual([]);
    });
  });
});

describe('renameWithRetry', () => {
  it('succeeds after transient EPERM failures', async () => {
    const flaky = makeFlakyRename(3, 'EPERM');
    await renameWithRetry('a', 'b', { renameFn: flaky.renameFn, attempts: 5, baseDelayMs: 1 });
    expect(flaky.getCalls()).toBe(4); // 3 failed + 1 success
  });

  it('succeeds after EBUSY', async () => {
    const flaky = makeFlakyRename(2, 'EBUSY');
    await renameWithRetry('a', 'b', { renameFn: flaky.renameFn, attempts: 5, baseDelayMs: 1 });
    expect(flaky.getCalls()).toBe(3);
  });

  it('propagates non-transient errors immediately (no retry)', async () => {
    const flaky = makeFlakyRename(1, 'ENOENT');
    await expect(renameWithRetry('a', 'b', { renameFn: flaky.renameFn, attempts: 5, baseDelayMs: 1 }))
      .rejects.toMatchObject({ code: 'ENOENT' });
    expect(flaky.getCalls()).toBe(1);
  });

  it('gives up after exhausting attempts and re-throws the last EPERM', async () => {
    const flaky = makeFlakyRename(99, 'EPERM');
    await expect(renameWithRetry('a', 'b', { renameFn: flaky.renameFn, attempts: 3, baseDelayMs: 1 }))
      .rejects.toMatchObject({ code: 'EPERM' });
    expect(flaky.getCalls()).toBe(3);
  });
});
