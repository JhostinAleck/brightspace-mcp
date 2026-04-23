import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '@/shared-kernel/config/loader.js';
import type { Config } from '@/shared-kernel/config/schema.js';
import { buildDependencies } from '@/composition-root.js';
import { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';

export interface AuthOptions {
  profile?: string;
  config?: string;
}

function defaultConfigPath(): string {
  return join(homedir(), '.brightspace-mcp', 'config.yaml');
}

export async function runAuth(opts: AuthOptions): Promise<void> {
  const path = opts.config ?? defaultConfigPath();
  const fileContent = existsSync(path) ? readFileSync(path, 'utf-8') : null;

  const cliOverrides: Record<string, unknown> = {};
  if (opts.profile) cliOverrides.default_profile = opts.profile;

  const config = loadConfig({
    fileContent,
    env: process.env,
    cliOverrides: cliOverrides as Partial<Config>,
  });

  const allowLocalHttp = process.env.BRIGHTSPACE_ALLOW_HTTP_LOCALHOST === '1';
  const deps = await buildDependencies({
    config,
    transportPolicy: allowLocalHttp
      ? TransportPolicy.allowHttpForLocalhost()
      : TransportPolicy.strict(),
  });

  const profileName = config.default_profile;
  process.stdout.write(`Authenticating profile "${profileName}"...\n`);

  const session = await deps.ensureAuth.execute({
    profile: profileName,
    baseUrl: deps.baseUrl,
  });

  process.stdout.write(
    `Success. Token from strategy "${session.source}" expires at ${session.expiresAt.toISOString()}\n`,
  );
}
