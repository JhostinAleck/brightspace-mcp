import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectMcpClients, registerWithClient } from '@/cli/commands/setup/clients.js';

describe('detectMcpClients', () => {
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'bmcp-clients-'));
  });

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('returns empty list when no client config exists', () => {
    const detected = detectMcpClients({ home: fakeHome, platform: 'darwin' });
    expect(detected).toEqual([]);
  });

  it('detects Claude Desktop on macOS when config exists', () => {
    const claudeDir = join(fakeHome, 'Library', 'Application Support', 'Claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'claude_desktop_config.json'), '{}', 'utf8');
    const detected = detectMcpClients({ home: fakeHome, platform: 'darwin' });
    expect(detected.map((c) => c.name)).toContain('claude-desktop');
  });

  it('detects Cursor when ~/.cursor/mcp.json exists', () => {
    const cursorDir = join(fakeHome, '.cursor');
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(join(cursorDir, 'mcp.json'), '{}', 'utf8');
    const detected = detectMcpClients({ home: fakeHome, platform: 'linux' });
    expect(detected.map((c) => c.name)).toContain('cursor');
  });
});

describe('registerWithClient', () => {
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'bmcp-reg-'));
  });

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('adds brightspace entry to Claude Desktop config preserving other servers', () => {
    const claudeDir = join(fakeHome, 'Library', 'Application Support', 'Claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'claude_desktop_config.json'),
      JSON.stringify({ mcpServers: { other: { command: 'other' } } }),
      'utf8',
    );
    registerWithClient({
      clientName: 'claude-desktop',
      home: fakeHome,
      platform: 'darwin',
      command: 'npx',
      args: ['--yes', 'brightspace-mcp', 'serve'],
      env: { BRIGHTSPACE_API_TOKEN: 'test' },
    });
    const updated = JSON.parse(
      readFileSync(join(claudeDir, 'claude_desktop_config.json'), 'utf8'),
    ) as { mcpServers: Record<string, unknown> };
    expect(updated.mcpServers.other).toBeDefined();
    expect(updated.mcpServers.brightspace).toBeDefined();
  });
});
