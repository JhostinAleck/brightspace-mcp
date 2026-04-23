import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '@/shared-kernel/config/loader.js';
import type { Config } from '@/shared-kernel/config/schema.js';
import { buildDependencies } from '@/composition-root.js';
import { startServer } from '@/mcp/server.js';
import { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';

export interface ServeOptions {
  profile?: string;
  config?: string;
  logLevel?: string;
  enableWrites?: boolean;
}

function defaultConfigPath(): string {
  return join(homedir(), '.brightspace-mcp', 'config.yaml');
}

export async function runServe(opts: ServeOptions): Promise<void> {
  const path = opts.config ?? defaultConfigPath();
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
  await startServer(deps);
}
