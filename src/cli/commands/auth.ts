import { readFileSync, existsSync } from 'node:fs';

import { loadConfig } from '@/shared-kernel/config/loader.js';
import type { Config } from '@/shared-kernel/config/schema.js';
import { Paths } from '@/shared-kernel/config/paths.js';
import { buildDependencies } from '@/composition-root.js';
import { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';

export interface AuthOptions {
  profile?: string;
  config?: string;
}

export async function runAuth(opts: AuthOptions): Promise<void> {
  const path = opts.config ?? Paths.configYaml();
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

  try {
    const session = await deps.ensureAuth.execute({
      profile: profileName,
      baseUrl: deps.baseUrl,
    });
    process.stdout.write(
      `Success. Token from strategy "${session.source}" expires at ${session.expiresAt.toISOString()}\n`,
    );
  } finally {
    // Release Redis / Playwright resources promptly so the CLI exits cleanly.
    await deps.disposables.disposeAll((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Shutdown warning: ${msg}\n`);
    });
  }
}
