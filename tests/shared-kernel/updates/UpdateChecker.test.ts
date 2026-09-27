import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateChecker, formatUpdateNotice, isNewerVersion } from '@/shared-kernel/updates/UpdateChecker.js';

type Registry = Record<string, { version: string; deprecated?: string } | 404>;

function fakeFetch(registry: Registry, calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    const key = url.replace('https://registry.npmjs.org/brightspace-mcp/', '');
    const entry = registry[key];
    if (!entry || entry === 404) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(entry), { status: 200 });
  };
}

describe('isNewerVersion', () => {
  it('compares major, minor and patch numerically', () => {
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false);
  });
});

describe('UpdateChecker', () => {
  let dir: string;
  let cachePath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'upd-'));
    cachePath = join(dir, 'update-check.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reports an available update', async () => {
    const checker = new UpdateChecker({
      currentVersion: '1.1.1',
      cachePath,
      fetch: fakeFetch({ latest: { version: '1.2.0' }, '1.1.1': { version: '1.1.1' } }),
    });
    const status = await checker.check();
    expect(status).toMatchObject({ current: '1.1.1', latest: '1.2.0', updateAvailable: true, deprecated: null });
    expect(checker.status).toEqual(status);
  });

  it('surfaces a deprecation message on the installed version (security signal)', async () => {
    const checker = new UpdateChecker({
      currentVersion: '1.1.1',
      cachePath,
      fetch: fakeFetch({
        latest: { version: '1.1.2' },
        '1.1.1': { version: '1.1.1', deprecated: 'Security fix in 1.1.2, please upgrade' },
      }),
    });
    const status = await checker.check();
    expect(status?.deprecated).toBe('Security fix in 1.1.2, please upgrade');
    expect(formatUpdateNotice(status!)).toMatch(/Security fix in 1\.1\.2/);
  });

  it('reuses a fresh cached result without hitting the network', async () => {
    const calls: string[] = [];
    const now = () => 1_000_000;
    writeFileSync(cachePath, JSON.stringify({
      current: '1.1.1', latest: '1.3.0', updateAvailable: true, deprecated: null, checkedAt: 1_000_000 - 60_000,
    }));
    const checker = new UpdateChecker({ currentVersion: '1.1.1', cachePath, now, fetch: fakeFetch({}, calls) });
    const status = await checker.check();
    expect(status?.latest).toBe('1.3.0');
    expect(calls).toHaveLength(0);
  });

  it('ignores a cache written by a different installed version', async () => {
    const calls: string[] = [];
    writeFileSync(cachePath, JSON.stringify({
      current: '1.0.0', latest: '1.1.1', updateAvailable: true, deprecated: null, checkedAt: Date.now(),
    }));
    const checker = new UpdateChecker({
      currentVersion: '1.1.1',
      cachePath,
      fetch: fakeFetch({ latest: { version: '1.1.1' }, '1.1.1': { version: '1.1.1' } }, calls),
    });
    const status = await checker.check();
    expect(status?.updateAvailable).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
    expect(JSON.parse(readFileSync(cachePath, 'utf8')).current).toBe('1.1.1');
  });

  it('returns null and never throws when the registry is unreachable', async () => {
    const checker = new UpdateChecker({
      currentVersion: '1.1.1',
      cachePath,
      fetch: async () => { throw new Error('offline'); },
    });
    await expect(checker.check()).resolves.toBeNull();
  });

  it('is a no-op when disabled', async () => {
    const calls: string[] = [];
    const checker = new UpdateChecker({ currentVersion: '1.1.1', cachePath, disabled: true, fetch: fakeFetch({}, calls) });
    await expect(checker.check()).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('formatUpdateNotice', () => {
  it('returns null when up to date and not deprecated', () => {
    expect(formatUpdateNotice({ current: '1.1.1', latest: '1.1.1', updateAvailable: false, deprecated: null, checkedAt: 0 })).toBeNull();
  });

  it('tells the user how to update', () => {
    const text = formatUpdateNotice({ current: '1.1.1', latest: '1.2.0', updateAvailable: true, deprecated: null, checkedAt: 0 });
    expect(text).toContain('v1.2.0');
    expect(text).toContain('v1.1.1');
    expect(text).toContain('brightspace-mcp upgrade');
  });
});
