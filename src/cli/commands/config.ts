import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { loadConfig } from '@/shared-kernel/config/loader.js';

export interface ConfigShowOptions {
  config?: string;
  resolved?: boolean;
}

export interface ConfigValidateOptions {
  config?: string;
}

export interface ConfigSetOptions {
  config?: string;
}

function resolveConfigPath(explicit: string | undefined): string {
  return explicit ?? join(homedir(), '.brightspace-mcp', 'config.yaml');
}

export async function runConfigValidate(opts: ConfigValidateOptions): Promise<void> {
  const path = resolveConfigPath(opts.config);
  const raw = readFileSync(path, 'utf8');

  // Parse YAML first so we can produce a readable YAML-parse error distinct
  // from schema-validation errors.
  try {
    parseYaml(raw);
  } catch (err) {
    throw new Error(
      `yaml parse error in ${path}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // Reuse the existing loader for schema validation. Passing no CLI overrides
  // and empty env means any schema violation in the file surfaces here.
  const config = loadConfig({ fileContent: raw, env: {}, cliOverrides: {} });

  // The schema does not cross-check that default_profile references a defined
  // profile, so enforce that here for parity with composition-root.
  if (!config.profiles[config.default_profile]) {
    throw new Error(
      `invalid config at ${path}: default_profile "${config.default_profile}" is not defined in profiles`,
    );
  }

  process.stdout.write(`Config at ${path} is valid.\n`);
}

export async function runConfigShow(opts: ConfigShowOptions): Promise<void> {
  const path = resolveConfigPath(opts.config);
  const raw = readFileSync(path, 'utf8');
  const yaml = parseYaml(raw) as Record<string, unknown>;

  const output = opts.resolved ? redactResolved(yaml) : yaml;
  process.stdout.write(stringifyYaml(output));
}

function redactResolved(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactResolved(v));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.endsWith('_ref') || k === 'token' || k === 'password' || k === 'secret') {
      out[k] = '[redacted]';
    } else {
      out[k] = redactResolved(v);
    }
  }
  return out;
}

export async function runConfigSet(
  path: string,
  value: string,
  opts: ConfigSetOptions,
): Promise<void> {
  const configPath = resolveConfigPath(opts.config);
  const raw = readFileSync(configPath, 'utf8');
  const yaml = parseYaml(raw) as Record<string, unknown>;

  setNestedPath(yaml, path.split('.'), coerceScalar(value));

  const serialized = stringifyYaml(yaml);

  // Validate BEFORE writing so a failed validation leaves the original file
  // untouched. Mirrors the loadConfig invocation in runConfigValidate.
  loadConfig({ fileContent: serialized, env: {}, cliOverrides: {} });

  writeFileSync(configPath, serialized, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`Updated ${path} in ${configPath}\n`);
}

function setNestedPath(
  obj: Record<string, unknown>,
  parts: string[],
  value: unknown,
): void {
  const [head, ...rest] = parts;
  if (!head) throw new Error('empty path');
  if (rest.length === 0) {
    obj[head] = value;
    return;
  }
  const child = obj[head];
  if (
    child === undefined ||
    child === null ||
    typeof child !== 'object' ||
    Array.isArray(child)
  ) {
    const fresh: Record<string, unknown> = {};
    obj[head] = fresh;
    setNestedPath(fresh, rest, value);
    return;
  }
  setNestedPath(child as Record<string, unknown>, rest, value);
}

function coerceScalar(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  return value;
}
