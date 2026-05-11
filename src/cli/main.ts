#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { runServe } from './commands/serve.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  version: string;
};

const program = new Command();
program.name('brightspace-mcp').description('MCP server for D2L Brightspace').version(pkg.version);

program
  .command('serve', { isDefault: true })
  .description('Start the MCP server (stdio transport)')
  .option('--profile <name>', 'Profile to use')
  .option('--config <path>', 'Path to config YAML')
  .option('--log-level <level>', 'debug | info | warn | error')
  .option('--enable-writes', 'Enable write operations (requires writes.enabled: true in config)')
  .action(async (opts) => {
    try {
      await runServe(opts);
    } catch (err) {
      process.stderr.write(
        `Failed to start server: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Interactive setup wizard (first-time configuration)')
  .option('--config <path>', 'Path to config YAML (default: ~/.brightspace-mcp/config.yaml)')
  .option('--skip-client-detection', 'Do not auto-detect MCP clients')
  .action(async (opts) => {
    const { runSetup } = await import('./commands/setup.js');
    await runSetup(opts);
  });

program
  .command('init')
  .description('Non-interactive config writer for CI and scripts (no TTY required)')
  .requiredOption('--base-url <url>', 'Brightspace instance URL')
  .requiredOption('--strategy <name>', 'api_token | browser | headless | session_cookie | oauth')
  .option('--profile <name>', 'Profile name in config', 'default')
  .option('--config <path>', 'Config file path')
  .option('--tz <iana>', 'Display timezone (IANA, auto-detected if omitted)')
  .option('--locale <code>', 'Display locale: en-US|es-419|pt-BR|fr-CA')
  .option('--force', 'Overwrite existing profile without confirmation')
  .option('--token-ref <ref>', 'Secret ref for API token (e.g. env:BRIGHTSPACE_API_TOKEN)')
  .option('--username-ref <ref>', 'Secret ref for username (e.g. env:BRIGHTSPACE_USERNAME)')
  .option('--password-ref <ref>', 'Secret ref for password (e.g. env:BRIGHTSPACE_PASSWORD)')
  .option('--login-url <url>', 'Login page URL (default: {base-url}/d2l/login)')
  .option('--preset <name>', 'Browser preset: microsoft | none')
  .option('--mfa-strategy <name>', 'none | totp | duo_push | manual_prompt', 'none')
  .option('--totp-secret-ref <ref>', 'Secret ref for TOTP (e.g. env:BRIGHTSPACE_TOTP_SECRET)')
  .option('--no-headless', 'Run browser in non-headless mode (shows window)')
  .option('--cookie-ref <ref>', 'Secret ref for session cookie (e.g. env:BRIGHTSPACE_COOKIE)')
  .option('--authorize-url <url>', 'OAuth authorize endpoint')
  .option('--token-url <url>', 'OAuth token endpoint')
  .option('--client-id <id>', 'OAuth client ID')
  .option('--redirect-uri <url>', 'OAuth redirect URI')
  .option('--scopes <scopes>', 'OAuth scopes (space or comma separated)')
  .option('--refresh-token-ref <ref>', 'Secret ref for OAuth refresh token')
  .action(async (opts) => {
    try {
      const { runInit } = await import('./commands/init.js');
      await runInit({
        baseUrl: opts.baseUrl,
        strategy: opts.strategy,
        profile: opts.profile,
        config: opts.config,
        tz: opts.tz,
        locale: opts.locale,
        force: opts.force,
        tokenRef: opts.tokenRef,
        usernameRef: opts.usernameRef,
        passwordRef: opts.passwordRef,
        loginUrl: opts.loginUrl,
        preset: opts.preset,
        mfaStrategy: opts.mfaStrategy,
        totpSecretRef: opts.totpSecretRef,
        headless: opts.headless,
        cookieRef: opts.cookieRef,
        authorizeUrl: opts.authorizeUrl,
        tokenUrl: opts.tokenUrl,
        clientId: opts.clientId,
        redirectUri: opts.redirectUri,
        scopes: opts.scopes,
        refreshTokenRef: opts.refreshTokenRef,
      });
    } catch (err) {
      process.stderr.write(`init failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program
  .command('ui')
  .description('Start local web dashboard at http://localhost:9876')
  .option('--port <number>', 'HTTP port', '9876')
  .option('--profile <name>', 'Profile to load')
  .option('--config <path>', 'Config file path')
  .option('--open', 'Open browser automatically on start')
  .action(async (opts) => {
    try {
      const port = parseInt(opts.port ?? '9876', 10);
      const { existsSync } = await import('node:fs');
      const { loadConfig } = await import('@/shared-kernel/config/loader.js');
      const { buildDependencies } = await import('@/composition-root.js');
      const { Paths } = await import('@/shared-kernel/config/paths.js');
      const path = opts.config ?? Paths.configYaml();
      const fileContent = existsSync(path) ? readFileSync(path, 'utf-8') : null;
      const cliOverrides: Record<string, unknown> = {};
      if (opts.profile) cliOverrides['default_profile'] = opts.profile;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = loadConfig({ fileContent, env: process.env, cliOverrides: cliOverrides as any });
      const deps = await buildDependencies({ config, enableWrites: false });
      const { runUi } = await import('./commands/ui.js');
      await runUi({ port, open: opts.open ?? false, deps });
    } catch (err) {
      process.stderr.write(`ui failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program
  .command('upgrade')
  .description('Upgrade brightspace-mcp to the latest version')
  .action(async () => {
    try {
      const { runUpgrade } = await import('./commands/upgrade.js');
      await runUpgrade();
    } catch (err) {
      process.stderr.write(`upgrade failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program
  .command('auth')
  .description('Manually re-authenticate the current profile')
  .option('--profile <name>', 'Profile to authenticate')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    const { runAuth } = await import('./commands/auth.js');
    await runAuth(opts);
  });

program
  .command('doctor')
  .description('End-to-end smoke test: config → auth → API discovery → list_my_courses. Exit 0 on green.')
  .option('--profile <name>', 'Profile to check')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    const { runDoctor } = await import('./commands/doctor.js');
    const code = await runDoctor(opts);
    process.exit(code);
  });

program
  .command('record-auth')
  .description(
    'Open a browser, let you authenticate manually, and capture the resulting session cookies. ' +
    'Useful for tenants whose MFA cannot be scripted (Authenticator number-matching, Yubikey, etc.).',
  )
  .option('--profile <name>', 'Profile to update or create (default: "default")')
  .option('--config <path>', 'Path to config YAML (default: ~/.brightspace-mcp/config.yaml)')
  .option('--login-url <url>', 'Override the start URL (default: <base_url>/d2l/login)')
  .option('--success-path <path>', 'Path fragment that signals successful login (default: /d2l/home)')
  .option('--save-to <where>', 'keychain | file | env | print (default: print)')
  .option('--timeout-min <minutes>', 'How long to wait for manual login (default: 10)')
  .action(async (opts) => {
    try {
      const { runRecordAuth } = await import('./commands/record-auth.js');
      await runRecordAuth(opts);
    } catch (err) {
      process.stderr.write(
        `record-auth failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    }
  });

const profileCmd = program.command('profile').description('Manage profiles in the config file');

profileCmd
  .command('list', { isDefault: true })
  .description('List defined profiles (* marks the default)')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    const { runProfileList } = await import('./commands/profile.js');
    runProfileList(opts);
  });

profileCmd
  .command('use <name>')
  .description('Set the default profile')
  .option('--config <path>', 'Path to config YAML')
  .action(async (name: string, opts) => {
    try {
      const { runProfileUse } = await import('./commands/profile.js');
      runProfileUse(name, opts);
    } catch (err) {
      process.stderr.write(`profile use failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

const configCmd = program.command('config').description('Inspect or edit the config file');

configCmd
  .command('show')
  .description('Print the effective config (secret refs redacted)')
  .option('--config <path>', 'Path to config YAML')
  .option('--resolved', 'Resolve secret references (still redacts values)')
  .action(async (opts) => {
    const { runConfigShow } = await import('./commands/config.js');
    await runConfigShow(opts);
  });

configCmd
  .command('validate')
  .description('Validate the config file without running the server')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    const { runConfigValidate } = await import('./commands/config.js');
    await runConfigValidate(opts);
  });

configCmd
  .command('set <path> <value>')
  .description('Set a config value (e.g. profiles.default.base_url https://foo)')
  .option('--config <path>', 'Path to config YAML')
  .action(async (path: string, value: string, opts) => {
    const { runConfigSet } = await import('./commands/config.js');
    await runConfigSet(path, value, opts);
  });

const cacheCmd = program.command('cache').description('Cache management');

cacheCmd
  .command('clear')
  .description('Clear the cache')
  .option('--profile <name>', 'Profile whose cache to clear')
  .option('--config <path>', 'Path to config YAML')
  .option('--context <name>', 'Specific context to clear (courses, grades, etc.)')
  .action(async (opts) => {
    const { runCacheClear } = await import('./commands/cache.js');
    await runCacheClear(opts);
  });

program.parseAsync(process.argv);
