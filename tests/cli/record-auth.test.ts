import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// Mock the lazy-playwright loader. The runRecordAuth function imports it
// dynamically via `createPlaywrightLoader()`, so we vi.mock the module.
vi.mock('@/shared-kernel/playwright/lazy-playwright.js', () => ({
  createPlaywrightLoader: () => async () => ({
    chromium: {
      launch: async () => ({
        newContext: async () => ({
          cookies: async () => [
            { name: 'd2lSessionVal', value: 'fake-session', domain: 'school.example.com', path: '/' },
            { name: 'irrelevant', value: 'x', domain: 'other.example.com', path: '/' },
          ],
          newPage: async () => ({
            goto: async () => undefined,
            url: () => 'https://school.example.com/d2l/home/123',
            waitForTimeout: async () => undefined,
          }),
        }),
        close: async () => undefined,
      }),
    },
  }),
}));

import { runRecordAuth } from '@/cli/commands/record-auth.js';

describe('runRecordAuth', () => {
  let tmp: string;
  let configPath: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stdoutBuffer: string[];

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'record-auth-'));
    configPath = join(tmp, 'config.yaml');
  });
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  beforeAll(() => {
    stdoutBuffer = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutBuffer.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
  });
  afterAll(() => { stdoutSpy.mockRestore(); });

  it('captures cookies, writes session_cookie YAML profile, and saves to file', async () => {
    // Seed a minimal pre-existing config with base_url so loginUrl can be derived.
    writeFileSync(configPath, stringifyYaml({
      profiles: { default: { base_url: 'https://school.example.com' } },
    }));

    await runRecordAuth({
      config: configPath,
      profile: 'default',
      saveTo: 'file',
      timeoutMin: '0.1', // 6 seconds — plenty for the mocked instant-success flow
      successPath: '/d2l/home',
    });

    const cfg = parseYaml(readFileSync(configPath, 'utf8')) as {
      default_profile?: string;
      profiles: { default: { auth?: { strategy?: string; session_cookie?: { cookie_ref?: string } } } };
    };
    expect(cfg.default_profile).toBe('default');
    expect(cfg.profiles.default.auth?.strategy).toBe('session_cookie');
    expect(cfg.profiles.default.auth?.session_cookie?.cookie_ref).toMatch(/^file:/);

    // Cookie file exists and contains the captured value (filtered to school.example.com)
    const cookiePath = cfg.profiles.default.auth!.session_cookie!.cookie_ref!.replace(/^file:/, '');
    expect(existsSync(cookiePath)).toBe(true);
    const cookieHeader = readFileSync(cookiePath, 'utf8');
    expect(cookieHeader).toContain('d2lSessionVal=fake-session');
    expect(cookieHeader).not.toContain('irrelevant');
  });

  it('errors when no login URL can be derived (no base_url, no --login-url)', async () => {
    writeFileSync(configPath, stringifyYaml({ profiles: {} }));
    await expect(runRecordAuth({
      config: configPath,
      profile: 'newprof',
      saveTo: 'print',
    })).rejects.toThrow(/No login URL/);
  });
});
