import { readFileSync, existsSync } from 'node:fs';
import { loadConfig } from '@/shared-kernel/config/loader.js';
import type { Config } from '@/shared-kernel/config/schema.js';
import { Paths } from '@/shared-kernel/config/paths.js';
import { buildDependencies } from '@/composition-root.js';
import { startServer } from '@/mcp/server.js';
import { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';
import { type UpdateChecker, formatUpdateNotice } from '@/shared-kernel/updates/UpdateChecker.js';
import { readPackageVersion } from '@/shared-kernel/updates/packageVersion.js';

export interface ServeOptions {
  profile?: string;
  config?: string;
  logLevel?: string;
  enableWrites?: boolean;
}

/** Logs the update notice to stderr for terminal users; MCP clients get it via the tool-result notice. */
export async function checkForUpdate(checker: UpdateChecker): Promise<void> {
  const status = await checker.check();
  const notice = status ? formatUpdateNotice(status) : null;
  if (notice) process.stderr.write(`\n${notice}\n\n`);
}

export async function runServe(opts: ServeOptions): Promise<void> {
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

  void checkForUpdate(deps.updateChecker); // fire-and-forget; never await
  await startServer({
    ...deps,
    version: readPackageVersion(),
    updateNotice: () => (deps.updateChecker.status ? formatUpdateNotice(deps.updateChecker.status) : null),
  });
}
