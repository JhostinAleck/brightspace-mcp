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
  .command('auth')
  .description('Manually re-authenticate the current profile')
  .option('--profile <name>', 'Profile to authenticate')
  .option('--config <path>', 'Path to config YAML')
  .action(async (opts) => {
    const { runAuth } = await import('./commands/auth.js');
    await runAuth(opts);
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
