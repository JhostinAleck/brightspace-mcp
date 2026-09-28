import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateConfigFile } from '@/cli/commands/tui/config/externalEdit';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cfg-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('validateConfigFile', () => {
  it('accepts a valid config', () => {
    const p = join(dir, 'config.yaml');
    writeFileSync(p, 'default_profile: default\nprofiles:\n  default:\n    base_url: https://school.example.test\n');
    expect(validateConfigFile(p)).toEqual({ ok: true });
  });

  it('reports invalid YAML and missing files', () => {
    const p = join(dir, 'config.yaml');
    writeFileSync(p, 'profiles: [unclosed');
    expect(validateConfigFile(p).ok).toBe(false);
    expect(validateConfigFile(join(dir, 'missing.yaml')).ok).toBe(false);
  });
});
