import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('npm pack smoke test', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'bmcp-pack-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('produces a tarball that contains required files and no excluded paths', () => {
    const json = execFileSync('npm', ['pack', '--json', '--pack-destination', workDir], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    const entries = JSON.parse(json) as Array<{ filename: string; files: Array<{ path: string }> }>;
    expect(entries).toHaveLength(1);
    const paths = entries[0]!.files.map((f) => f.path);

    expect(paths).toContain('package.json');
    expect(paths).toContain('README.md');
    expect(paths).toContain('LICENSE');
    expect(paths).toContain('CHANGELOG.md');
    expect(paths.some((p) => p.startsWith('build/cli/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('docker/'))).toBe(true);

    expect(paths.some((p) => p.startsWith('src/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('tests/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('docs/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('node_modules/'))).toBe(false);
  }, 60_000);

  it('bin entry points to an existing built file', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      bin: Record<string, string>;
    };
    expect(pkg.bin['brightspace-mcp']).toBe('build/cli/main.js');
  });
});
