/**
 * Doctor command: end-to-end smoke test of an installation. Walks the user
 * through "is X working" steps and prints a green check or a red X with the
 * next-action hint. Exit code 0 if all pass; 1 if any fail.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { Paths } from '@/shared-kernel/config/paths.js';
import { ConfigSchema } from '@/shared-kernel/config/schema.js';
import { buildDependencies } from '@/composition-root.js';

export interface DoctorOptions {
  config?: string;
  profile?: string;
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

export async function runDoctor(opts: DoctorOptions): Promise<number> {
  const configPath = resolve(opts.config ?? Paths.configYaml());
  const out = (s: string): void => { process.stdout.write(s); };

  out(`\nbrightspace-mcp doctor — ${configPath}\n\n`);

  let allOk = true;
  const fail = (label: string, err: unknown, hint?: string): void => {
    allOk = false;
    out(`${RED}✗${RESET} ${label}\n`);
    out(`    ${err instanceof Error ? err.message : String(err)}\n`);
    if (hint) out(`    ${YELLOW}→ ${hint}${RESET}\n`);
  };
  const pass = (label: string, detail?: string): void => {
    out(`${GREEN}✓${RESET} ${label}`);
    if (detail) out(` ${detail}`);
    out('\n');
  };

  // Step 1: config exists
  if (!existsSync(configPath)) {
    fail('Config file', new Error(`Not found: ${configPath}`),
      'Run `brightspace-mcp setup` or `brightspace-mcp record-auth` to create one.');
    return 1;
  }
  pass('Config file', `(${configPath})`);

  // Step 2: parse + validate
  let config: ReturnType<typeof ConfigSchema.parse>;
  try {
    const raw = parseYaml(readFileSync(configPath, 'utf8'));
    config = ConfigSchema.parse(raw);
  } catch (err) {
    fail('Config validates', err, 'Run `brightspace-mcp config validate` for the full error.');
    return 1;
  }
  pass('Config validates', `(${Object.keys(config.profiles).length} profile(s))`);

  // Step 3: profile selected
  const profileName = opts.profile ?? config.default_profile;
  const profile = config.profiles[profileName];
  if (!profile || !profile.base_url) {
    fail('Profile resolves',
      new Error(`Profile "${profileName}" missing or has no base_url`),
      'Run `brightspace-mcp profile list` to see available profiles.');
    return 1;
  }
  pass('Profile resolves', `(${profileName} → ${profile.base_url})`);

  // Step 4: build dependencies (loads creds, discovers D2L API versions)
  let deps: Awaited<ReturnType<typeof buildDependencies>>;
  // Override default_profile so buildDependencies picks the one we want.
  const cfg = { ...config, default_profile: profileName };
  try {
    deps = await buildDependencies({ config: cfg });
  } catch (err) {
    fail('D2L API versions discovered', err,
      'base_url unreachable, or credentials misconfigured. Check the URL in a browser.');
    return 1;
  }
  pass('D2L API versions discovered',
    `(lp=${deps.staticInfo.versions.lp}, le=${deps.staticInfo.versions.le})`);

  // Step 5: auth
  try {
    const session = await deps.ensureAuth.execute({
      profile: profileName,
      baseUrl: profile.base_url,
    });
    pass('Authentication',
      `(${session.userIdentity.displayName ?? '<unknown user>'}, source: ${session.source})`);
  } catch (err) {
    fail('Authentication', err,
      'Re-run `brightspace-mcp record-auth` if cookies expired, or `brightspace-mcp auth` for credential strategies.');
    await deps.disposables.disposeAll().catch(() => undefined);
    return 1;
  }

  // Step 6: list courses (smoke read)
  try {
    const courses = await deps.courseRepo.findMyCourses({ activeOnly: true });
    pass('list_my_courses smoke read', `(${courses.length} course(s) enrolled)`);
  } catch (err) {
    fail('list_my_courses smoke read', err,
      'Auth worked but courses endpoint failed — possible D2L API version mismatch.');
  }

  // Step 7: writes gate state
  if (deps.writesGate.allowsWrites) {
    pass('Writes gate', '(enabled)');
  } else {
    out(`${YELLOW}~${RESET} Writes gate (disabled — pass --enable-writes and set writes.enabled: true to use submit_assignment etc.)\n`);
  }

  await deps.disposables.disposeAll().catch(() => undefined);

  out('\n');
  if (allOk) {
    out(`${GREEN}All checks passed.${RESET}\n`);
    return 0;
  } else {
    out(`${RED}Some checks failed — fix the items above and re-run.${RESET}\n`);
    return 1;
  }
}
