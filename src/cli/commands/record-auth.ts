/**
 * Interactive auth recorder.
 *
 * Opens a non-headless Playwright browser, navigates to a Brightspace login
 * page, waits for the user to complete whatever authentication flow their
 * tenant requires (TOTP, push, SAML SSO, etc.), then captures the resulting
 * session cookies and writes them into the YAML config (or prints them for
 * the user to store wherever they prefer).
 *
 * Why this exists: tenants with custom MFA flows that the `browser` strategy
 * cannot script (Microsoft Authenticator number-matching, biometric prompts,
 * Yubikey USB taps, etc.) still let humans authenticate manually. The
 * recorder captures the cookies a human earned and the MCP server reuses
 * them via `session_cookie` strategy until they expire.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { createPlaywrightLoader } from '@/shared-kernel/playwright/lazy-playwright.js';
import { Paths } from '@/shared-kernel/config/paths.js';

export interface RecordAuthOptions {
  config?: string;
  profile?: string;
  loginUrl?: string;
  successPath?: string;
  saveTo?: 'env' | 'file' | 'keychain' | 'print';
  timeoutMin?: string;
}

interface YamlProfile {
  base_url?: string;
  auth?: {
    strategy?: string;
    session_cookie?: { cookie_ref?: string; session_ttl_seconds?: number };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface YamlRoot {
  default_profile?: string;
  profiles?: Record<string, YamlProfile>;
  [k: string]: unknown;
}

export async function runRecordAuth(opts: RecordAuthOptions): Promise<void> {
  const configPath = resolve(opts.config ?? Paths.configYaml());
  const profileName = opts.profile ?? 'default';
  const saveMode = opts.saveTo ?? 'print';
  const timeoutMs = (Number.parseFloat(opts.timeoutMin ?? '10') || 10) * 60_000;

  // Load existing config (or start with a stub if missing)
  let yaml: YamlRoot = {};
  if (existsSync(configPath)) {
    yaml = (parseYaml(readFileSync(configPath, 'utf8')) as YamlRoot) ?? {};
  }
  yaml.profiles ??= {};
  yaml.profiles[profileName] ??= {};
  const profile = yaml.profiles[profileName];

  // Determine starting URL: explicit flag → existing base_url + /d2l/login → ask
  const baseUrl = profile.base_url;
  const loginUrl = opts.loginUrl
    ?? (baseUrl ? `${baseUrl.replace(/\/$/, '')}/d2l/login` : null);
  if (!loginUrl) {
    throw new Error(
      'No login URL available. Pass --login-url, or run `brightspace-mcp setup` first to set base_url.',
    );
  }
  const baseFromLogin = new URL(loginUrl).origin;
  const successPath = opts.successPath ?? '/d2l/home';

  process.stdout.write(`\n  Opening browser at ${loginUrl}\n`);
  process.stdout.write(`  Complete your login. The recorder will capture cookies\n`);
  process.stdout.write(`  once you reach a URL containing "${successPath}".\n`);
  process.stdout.write(`  Timeout: ${Math.round(timeoutMs / 60_000)} minutes.\n\n`);

  const pw = await createPlaywrightLoader()();
  // Lazy-playwright surface is intentionally narrow; widen for newPage/cookies/etc.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromium = (pw as any).chromium;
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Poll page URL until we reach the success path (or timeout).
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const url = page.url();
      if (url.startsWith(baseFromLogin) && url.includes(successPath)) break;
      await page.waitForTimeout(1_000);
    }
    const finalUrl = page.url();
    if (!finalUrl.includes(successPath)) {
      throw new Error(`Did not reach ${successPath} within ${timeoutMs / 60_000} min — aborting.`);
    }

    // Capture cookies relevant to the Brightspace origin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allCookies = await context.cookies();
    const host = new URL(baseFromLogin).hostname;
    const ours = allCookies.filter((c: { domain: string }) =>
      c.domain === host || c.domain === `.${host}` || host.endsWith(c.domain.replace(/^\./, '')),
    );
    if (ours.length === 0) {
      throw new Error(`No cookies captured for ${host}`);
    }
    const cookieHeader = ours.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join('; ');

    process.stdout.write(`\n  Captured ${ours.length} cookies for ${host}\n`);

    // Persist the cookie header.
    let cookieRef: string;
    switch (saveMode) {
      case 'file': {
        const cookieFile = resolve(homedir(), '.brightspace-mcp', `cookies-${profileName}.txt`);
        mkdirSync(dirname(cookieFile), { recursive: true });
        writeFileSync(cookieFile, cookieHeader, { encoding: 'utf8', mode: 0o600 });
        cookieRef = `file:${cookieFile}`;
        process.stdout.write(`  Saved to ${cookieFile} (mode 0600)\n`);
        break;
      }
      case 'keychain': {
        cookieRef = `keychain:brightspace-mcp/${profileName}-cookie`;
        try {
          // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-explicit-any
          const { Entry } = (await import('@napi-rs/keyring')) as any;
          new Entry('brightspace-mcp', `${profileName}-cookie`).setPassword(cookieHeader);
          process.stdout.write(`  Saved to OS keychain (service=brightspace-mcp account=${profileName}-cookie)\n`);
        } catch (err) {
          process.stdout.write(
            `  ⚠ Keychain unavailable (${err instanceof Error ? err.message : String(err)}). Falling back to file.\n`,
          );
          const cookieFile = resolve(homedir(), '.brightspace-mcp', `cookies-${profileName}.txt`);
          mkdirSync(dirname(cookieFile), { recursive: true });
          writeFileSync(cookieFile, cookieHeader, { encoding: 'utf8', mode: 0o600 });
          cookieRef = `file:${cookieFile}`;
        }
        break;
      }
      case 'env': {
        const envName = `BRIGHTSPACE_${profileName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_COOKIE`;
        cookieRef = `env:${envName}`;
        process.stdout.write(`\n  Set this env var (and add to your shell profile / MCP client config):\n\n`);
        process.stdout.write(`    export ${envName}='${cookieHeader.replace(/'/g, `'\\''`)}'\n\n`);
        break;
      }
      case 'print':
      default: {
        cookieRef = 'env:BRIGHTSPACE_COOKIE';
        process.stdout.write(`\n  Cookie header (copy somewhere safe):\n\n`);
        process.stdout.write(`    ${cookieHeader}\n\n`);
        break;
      }
    }

    // Update YAML to use session_cookie strategy with the captured ref.
    profile.base_url ??= baseFromLogin;
    profile.auth = {
      ...(profile.auth ?? {}),
      strategy: 'session_cookie',
      session_cookie: { cookie_ref: cookieRef, session_ttl_seconds: 3_600 },
    };
    yaml.default_profile ??= profileName;

    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, stringifyYaml(yaml), { encoding: 'utf8', mode: 0o600 });
    process.stdout.write(`  Updated ${configPath} → strategy: session_cookie, cookie_ref: ${cookieRef}\n`);
    process.stdout.write(`\n  Done. Test with: brightspace-mcp auth --test --profile ${profileName}\n`);
    process.stdout.write(`  Cookies expire in ~1 hour. Re-run this command when auth fails.\n`);
  } finally {
    await browser.close();
  }
}
