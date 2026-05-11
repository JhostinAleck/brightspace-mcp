import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { runInit } from '@/cli/commands/init.js';

const TMP = (suffix: string) => `/tmp/brightspace-mcp-init-test-${suffix}-${Date.now()}.yaml`;

function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (existsSync(p)) unlinkSync(p);
  }
}

describe('runInit', () => {
  it('writes valid YAML for api_token strategy', async () => {
    const path = TMP('api');
    await runInit({ baseUrl: 'https://uni.brightspace.com', strategy: 'api_token', tokenRef: 'env:MY_TOKEN', config: path });
    const yaml = readFileSync(path, 'utf8');
    expect(yaml).toContain('api_token');
    expect(yaml).toContain('env:MY_TOKEN');
    expect(yaml).toContain('https://uni.brightspace.com');
    cleanup(path);
  });

  it('throws on missing tokenRef for api_token', async () => {
    await expect(
      runInit({ baseUrl: 'https://x.com', strategy: 'api_token', config: TMP('err1') }),
    ).rejects.toThrow(/token-ref/i);
  });

  it('applies microsoft preset selectors for browser strategy', async () => {
    const path = TMP('browser-ms');
    await runInit({
      baseUrl: 'https://x.com',
      strategy: 'browser',
      preset: 'microsoft',
      usernameRef: 'env:U',
      passwordRef: 'env:P',
      config: path,
    });
    const yaml = readFileSync(path, 'utf8');
    expect(yaml).toContain('#i0116');
    expect(yaml).toContain('env:U');
    cleanup(path);
  });

  it('throws on missing usernameRef for browser strategy', async () => {
    await expect(
      runInit({ baseUrl: 'https://x.com', strategy: 'browser', passwordRef: 'env:P', config: TMP('err2') }),
    ).rejects.toThrow(/username-ref/i);
  });

  it('writes output block with custom tz and locale', async () => {
    const path = TMP('output');
    await runInit({
      baseUrl: 'https://x.com', strategy: 'api_token', tokenRef: 'env:T',
      tz: 'America/Bogota', locale: 'es-419', config: path,
    });
    const yaml = readFileSync(path, 'utf8');
    expect(yaml).toContain('America/Bogota');
    expect(yaml).toContain('es-419');
    cleanup(path);
  });

  it('writes session_cookie strategy', async () => {
    const path = TMP('cookie');
    await runInit({
      baseUrl: 'https://x.com', strategy: 'session_cookie',
      cookieRef: 'env:BRIGHTSPACE_COOKIE', config: path,
    });
    const yaml = readFileSync(path, 'utf8');
    expect(yaml).toContain('session_cookie');
    expect(yaml).toContain('env:BRIGHTSPACE_COOKIE');
    cleanup(path);
  });

  it('throws when preset=microsoft used with non-browser strategy', async () => {
    await expect(
      runInit({
        baseUrl: 'https://x.com', strategy: 'headless',
        preset: 'microsoft', usernameRef: 'env:U', passwordRef: 'env:P',
        config: TMP('err3'),
      }),
    ).rejects.toThrow(/preset.*browser/i);
  });

  it('uses default profile name "default" when none specified', async () => {
    const path = TMP('profile');
    await runInit({ baseUrl: 'https://x.com', strategy: 'api_token', tokenRef: 'env:T', config: path });
    const yaml = readFileSync(path, 'utf8');
    expect(yaml).toContain('default');
    cleanup(path);
  });
});
