import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runConfigValidate } from '@/cli/commands/config.js';

describe('runConfigValidate', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bmcp-cfg-validate-'));
    configPath = join(dir, 'config.yaml');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('exits 0 on a valid config', async () => {
    writeFileSync(
      configPath,
      `default_profile: p1
profiles:
  p1:
    base_url: https://school.brightspace.com
    auth:
      strategy: api_token
      api_token: { token_ref: env:TOKEN }
`,
      'utf8',
    );
    const logs: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      logs.push(String(chunk));
      return true;
    });
    await expect(runConfigValidate({ config: configPath })).resolves.toBeUndefined();
    expect(logs.join('')).toMatch(/valid/i);
  });

  it('throws a readable error on invalid YAML', async () => {
    writeFileSync(configPath, 'not: valid:\n  - yaml: [unclosed', 'utf8');
    await expect(runConfigValidate({ config: configPath })).rejects.toThrow(/yaml|parse/i);
  });

  it('throws a readable error when required fields are missing', async () => {
    writeFileSync(configPath, 'default_profile: p1\nprofiles: {}\n', 'utf8');
    await expect(runConfigValidate({ config: configPath })).rejects.toThrow();
  });
});
