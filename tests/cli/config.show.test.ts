import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runConfigShow } from '@/cli/commands/config.js';

describe('runConfigShow', () => {
  let dir: string;
  let configPath: string;
  let logs: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bmcp-cfg-show-'));
    configPath = join(dir, 'config.yaml');
    logs = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      logs += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints the config and keeps env: refs visible (without resolving them)', async () => {
    writeFileSync(
      configPath,
      `default_profile: p1
profiles:
  p1:
    base_url: https://school.brightspace.com
    auth:
      strategy: api_token
      api_token: { token_ref: env:SECRET_TOKEN }
`,
      'utf8',
    );
    process.env.SECRET_TOKEN = 'hunter2';
    await runConfigShow({ config: configPath });
    expect(logs).toContain('https://school.brightspace.com');
    expect(logs).toContain('env:SECRET_TOKEN');
    expect(logs).not.toContain('hunter2');
    delete process.env.SECRET_TOKEN;
  });

  it('with --resolved, shows [redacted] instead of secret refs', async () => {
    writeFileSync(
      configPath,
      `default_profile: p1
profiles:
  p1:
    base_url: https://school.brightspace.com
    auth:
      strategy: api_token
      api_token: { token_ref: env:SECRET_TOKEN }
`,
      'utf8',
    );
    process.env.SECRET_TOKEN = 'hunter2';
    await runConfigShow({ config: configPath, resolved: true });
    expect(logs).toMatch(/\[redacted\]/i);
    expect(logs).not.toContain('hunter2');
    delete process.env.SECRET_TOKEN;
  });
});
