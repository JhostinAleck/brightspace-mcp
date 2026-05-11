import { readFileSync, existsSync } from 'node:fs';
import { loadConfig } from '@/shared-kernel/config/loader.js';
import type { Config } from '@/shared-kernel/config/schema.js';
import { Paths } from '@/shared-kernel/config/paths.js';
import { buildDependencies } from '@/composition-root.js';
import { startServer } from '@/mcp/server.js';
import { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';
import { isNewerVersion } from './upgrade.js';

export interface ServeOptions {
  profile?: string;
  config?: string;
  logLevel?: string;
  enableWrites?: boolean;
}

export async function checkForUpdate(): Promise<void> {
  if (process.env['BRIGHTSPACE_NO_UPDATE_CHECK'] === '1') return;
  try {
    const { readFileSync: rfs, existsSync: es } = await import('node:fs');
    const { dirname: dn, join: jn } = await import('node:path');
    const { fileURLToPath: ftu } = await import('node:url');
    const __f = ftu(import.meta.url);
    const __d = dn(__f);
    const candidates = [jn(__d, '..', '..', '..', 'package.json'), jn(__d, '..', '..', 'package.json')];
    let current = '0.0.0';
    for (const p of candidates) {
      if (es(p)) {
        current = (JSON.parse(rfs(p, 'utf8')) as { version: string }).version;
        break;
      }
    }
    const signal = AbortSignal.timeout(3000);
    const res = await fetch('https://registry.npmjs.org/brightspace-mcp/latest', { signal });
    if (!res.ok) return;
    const data = (await res.json()) as { version: string };
    if (data.version && isNewerVersion(data.version, current)) {
      process.stderr.write(
        `\n  ⬆  New version available: v${data.version} (you have v${current})\n` +
        `     Run: brightspace-mcp upgrade\n\n`,
      );
    }
  } catch {
    // Never break startup for an update check failure
  }
}

export async function runServe(opts: ServeOptions): Promise<void> {
  void checkForUpdate(); // fire-and-forget; never await
  const path = opts.config ?? Paths.configYaml();
  const fileContent = existsSync(path) ? readFileSync(path, 'utf-8') : null;

  const cliOverrides: Record<string, unknown> = {};
  if (opts.profile) cliOverrides.default_profile = opts.profile;
  if (opts.logLevel) cliOverrides.logging = { level: opts.logLevel };

  const config = loadConfig({
    fileContent,
    env: process.env,
    cliOverrides: cliOverrides as Partial<Config>,
  });

  const allowLocalHttp = process.env.BRIGHTSPACE_ALLOW_HTTP_LOCALHOST === '1';
  const deps = await buildDependencies({
    config,
    transportPolicy: allowLocalHttp ? TransportPolicy.allowHttpForLocalhost() : TransportPolicy.strict(),
    enableWrites: opts.enableWrites ?? false,
  });

  // Graceful shutdown: release Redis connection, close Playwright browser,
  // flush file locks. Without this the process lingers on SIGTERM until the
  // OS kills it (ioredis + Playwright keep timers alive).
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(`Received ${signal}, shutting down...\n`);
    await deps.disposables.disposeAll((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Shutdown error: ${msg}\n`);
    });
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });

  await startServer(deps);
}
