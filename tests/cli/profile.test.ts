import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { runProfileList, runProfileUse } from '@/cli/commands/profile.js';

describe('profile commands', () => {
  let tmp: string;
  let configPath: string;
  let stdout: string[];
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'profile-cmd-'));
    configPath = join(tmp, 'config.yaml');
  });
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  beforeEach(() => {
    stdout = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
    writeFileSync(configPath,
      'default_profile: alpha\nprofiles:\n  alpha:\n    base_url: https://a.example.com\n  beta:\n    base_url: https://b.example.com\n',
    );
  });
  afterEach(() => { stdoutSpy.mockRestore(); });

  it('list shows all profiles with * on the default', () => {
    runProfileList({ config: configPath });
    const text = stdout.join('');
    expect(text).toContain('* alpha');
    expect(text).toContain('  beta');
    expect(text).toContain('Default: alpha');
  });

  it('use switches the default and persists the change', () => {
    runProfileUse('beta', { config: configPath });
    const reread = parseYaml(readFileSync(configPath, 'utf8')) as { default_profile?: string };
    expect(reread.default_profile).toBe('beta');
    expect(stdout.join('')).toContain('alpha → beta');
  });

  it('use is a no-op when already on the requested profile', () => {
    runProfileUse('alpha', { config: configPath });
    expect(stdout.join('')).toContain('Already on');
  });

  it('use throws on unknown profile', () => {
    expect(() => runProfileUse('gamma', { config: configPath })).toThrow(/not defined/);
  });
});
