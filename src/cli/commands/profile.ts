import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { Paths } from '@/shared-kernel/config/paths.js';

export interface ProfileCommandOptions {
  config?: string;
}

interface YamlRoot {
  default_profile?: string;
  profiles?: Record<string, unknown>;
  [k: string]: unknown;
}

function loadYaml(configPath: string): YamlRoot {
  return (parseYaml(readFileSync(configPath, 'utf8')) as YamlRoot) ?? {};
}

export function runProfileList(opts: ProfileCommandOptions): void {
  const configPath = resolve(opts.config ?? Paths.configYaml());
  const yaml = loadYaml(configPath);
  const profiles = Object.keys(yaml.profiles ?? {});
  if (profiles.length === 0) {
    process.stdout.write('No profiles defined. Run `brightspace-mcp setup` to create one.\n');
    return;
  }
  const def = yaml.default_profile ?? '(none)';
  process.stdout.write(`Default: ${def}\n\nProfiles:\n`);
  for (const name of profiles) {
    process.stdout.write(`  ${name === def ? '* ' : '  '}${name}\n`);
  }
}

export function runProfileUse(name: string, opts: ProfileCommandOptions): void {
  const configPath = resolve(opts.config ?? Paths.configYaml());
  const yaml = loadYaml(configPath);
  const known = Object.keys(yaml.profiles ?? {});
  if (!known.includes(name)) {
    throw new Error(`Profile "${name}" not defined. Known: ${known.join(', ') || '(none)'}`);
  }
  const previous = yaml.default_profile;
  if (previous === name) {
    process.stdout.write(`Already on profile "${name}".\n`);
    return;
  }
  yaml.default_profile = name;
  writeFileSync(configPath, stringifyYaml(yaml), { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`default_profile: ${previous ?? '(unset)'} → ${name}\n`);
}
