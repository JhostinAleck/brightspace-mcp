import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

import { confirm, input, select } from '@inquirer/prompts';
import { stringify as stringifyYaml } from 'yaml';

import { detectSystemTz, isValidTz } from '@/shared-kernel/output/time/tz-detector.js';
import {
  detectSystemLocale,
  type SupportedLocale,
} from '@/shared-kernel/output/i18n/locale-detector.js';
import { buildOutputContext } from '@/shared-kernel/output/index.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

import {
  promptApiToken,
  promptAuthStrategy,
  promptBaseUrl,
  promptBrowserPreset,
  promptCookieRef,
  promptLoginUrl,
  promptMfaStrategy,
  promptPasswordRef,
  promptPasswordValue,
  promptSimpleSelectors,
  promptTotpSecret,
  promptUsernameRef,
  promptUsername,
  buildMicrosoftSsoSelectors,
} from './setup/prompts.js';
import { detectMcpClients, registerWithClient } from './setup/clients.js';
import { chooseSecretRef } from './setup/credentials.js';

export interface SetupOptions {
  config?: string;
  skipClientDetection?: boolean;
}

export async function runSetup(opts: SetupOptions): Promise<void> {
  const configPath = opts.config ?? join(homedir(), '.brightspace-mcp', 'config.yaml');

  const ctx = buildOutputContext({
    tz: detectSystemTz(),
    locale: detectSystemLocale(),
    format: 'markdown',
    includeMetaFooter: false,
  });

  process.stdout.write(`${ctx.t('wizard.welcome')}\n\n`);

  const baseUrl = await promptBaseUrl(ctx);
  const authStrategy = await promptAuthStrategy(ctx);

  const auth: Record<string, unknown> = { strategy: authStrategy };
  const profile: Record<string, unknown> = { base_url: baseUrl, auth };
  const config: Record<string, unknown> = {
    default_profile: 'my_school',
    profiles: { my_school: profile },
  };

  if (authStrategy === 'api_token') {
    const token = await promptApiToken(ctx);
    process.env.BRIGHTSPACE_API_TOKEN = token;
    auth['api_token'] = {
      token_ref: chooseSecretRef({ strategy: 'env', varName: 'BRIGHTSPACE_API_TOKEN' }),
    };
  } else if (authStrategy === 'browser') {
    await configureBrowser(auth, baseUrl, ctx);
  } else if (authStrategy === 'headless') {
    await configureHeadless(auth, ctx);
  } else if (authStrategy === 'session_cookie') {
    await configureSessionCookie(auth, ctx);
  }

  const detectedTz = detectSystemTz();
  const tz = await input({
    message: ctx.t('wizard.tz_prompt'),
    default: detectedTz,
    validate: (v) => (isValidTz(v) ? true : ctx.t('wizard.tz_invalid', { detected: detectedTz })),
  });

  const detectedLocale = detectSystemLocale();
  const locale = await select<SupportedLocale>({
    message: ctx.t('wizard.locale_prompt'),
    default: detectedLocale,
    choices: [
      { value: 'en-US' as const, name: 'English (US)' },
      { value: 'es-419' as const, name: 'Español (Latinoamérica)' },
      { value: 'pt-BR' as const, name: 'Português (Brasil)' },
      { value: 'fr-CA' as const, name: 'Français (Canada)' },
    ],
  });

  config.output = {
    tz,
    locale,
    format: 'markdown',
    include_meta_footer: true,
  };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, stringifyYaml(config), { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`\n${ctx.t('wizard.done', { path: configPath })}\n`);

  if (!opts.skipClientDetection) {
    const detected = detectMcpClients({ home: homedir(), platform: platform() });
    if (detected.length > 0) {
      process.stdout.write(`\nDetected MCP clients: ${detected.map((c) => c.name).join(', ')}\n`);
      for (const client of detected) {
        const register = await confirm({ message: `Register with ${client.name}?`, default: true });
        if (register) {
          registerWithClient({
            clientName: client.name,
            home: homedir(),
            platform: platform(),
            command: 'npx',
            args: ['--yes', 'brightspace-mcp@latest', 'serve'],
            env: { BRIGHTSPACE_CONFIG: configPath },
          });
          process.stdout.write(`Registered with ${client.name}.\n`);
        }
      }
    } else {
      process.stdout.write(
        '\nNo MCP clients detected. See docs/clients.md for manual setup snippets.\n',
      );
    }
  }

  process.stdout.write(`\n${ctx.t('wizard.next_step')}\n`);
}

async function configureBrowser(
  auth: Record<string, unknown>,
  baseUrl: string,
  ctx: OutputContext,
): Promise<void> {
  process.stdout.write(
    '\nBrowser strategy uses Playwright to automate login in a headless browser.\n',
  );
  process.stdout.write('You need: npm install playwright && npx playwright install chromium\n\n');

  const preset = await promptBrowserPreset(ctx);

  let selectors: Record<string, unknown>;
  if (preset === 'microsoft_sso') {
    selectors = buildMicrosoftSsoSelectors();
    process.stdout.write('Using Microsoft SSO selector preset.\n');
  } else {
    selectors = await promptSimpleSelectors(ctx);
  }

  const loginUrl =
    preset === 'microsoft_sso'
      ? `${baseUrl.replace(/\/$/, '')}/d2l/login`
      : await promptLoginUrl(ctx);

  const usernameVarName = await promptUsernameRef(ctx);
  const username = await promptUsername(ctx);
  process.env[usernameVarName] = username;

  const passwordVarName = await promptPasswordRef(ctx);
  const passwordValue = await promptPasswordValue(ctx);
  process.env[passwordVarName] = passwordValue;

  const mfaStrategy = await promptMfaStrategy(ctx);
  const mfaBlock: Record<string, unknown> = { strategy: mfaStrategy };
  if (mfaStrategy === 'totp') {
    const secret = await promptTotpSecret(ctx);
    process.env['BRIGHTSPACE_TOTP_SECRET'] = secret;
    mfaBlock['totp'] = {
      secret_ref: chooseSecretRef({ strategy: 'env', varName: 'BRIGHTSPACE_TOTP_SECRET' }),
    };
  } else if (mfaStrategy === 'duo_push') {
    mfaBlock['duo_push'] = {};
  }

  auth['browser'] = {
    login_url: loginUrl,
    selectors,
    username_ref: chooseSecretRef({ strategy: 'env', varName: usernameVarName }),
    password_ref: chooseSecretRef({ strategy: 'env', varName: passwordVarName }),
    headless: true,
    mfa: mfaBlock,
  };

  process.stdout.write('\nNote: set these env vars before starting the server:\n');
  process.stdout.write(`  export ${usernameVarName}="your-username"\n`);
  process.stdout.write(`  export ${passwordVarName}="your-password"\n`);
  if (mfaStrategy === 'totp') {
    process.stdout.write('  export BRIGHTSPACE_TOTP_SECRET="your-totp-base32-secret"\n');
  }
}

async function configureHeadless(auth: Record<string, unknown>, ctx: OutputContext): Promise<void> {
  process.stdout.write(
    '\nHeadless strategy automates login via HTTP — no browser window needed.\n',
  );
  process.stdout.write('Supports Duo Push, TOTP, and Manual Prompt MFA.\n\n');

  const loginUrl = await promptLoginUrl(ctx);

  const usernameVarName = await promptUsernameRef(ctx);
  const username = await promptUsername(ctx);
  process.env[usernameVarName] = username;

  const passwordVarName = await promptPasswordRef(ctx);
  const passwordValue = await promptPasswordValue(ctx);
  process.env[passwordVarName] = passwordValue;

  const mfaStrategy = await promptMfaStrategy(ctx);
  const mfaBlock: Record<string, unknown> = { strategy: mfaStrategy };
  if (mfaStrategy === 'totp') {
    const secret = await promptTotpSecret(ctx);
    process.env['BRIGHTSPACE_TOTP_SECRET'] = secret;
    mfaBlock['totp'] = {
      secret_ref: chooseSecretRef({ strategy: 'env', varName: 'BRIGHTSPACE_TOTP_SECRET' }),
    };
  } else if (mfaStrategy === 'duo_push') {
    mfaBlock['duo_push'] = {};
    process.stdout.write('\nDuo Push: the server will poll for mobile approval automatically.\n');
  }

  auth['headless'] = {
    login_url: loginUrl,
    username_ref: chooseSecretRef({ strategy: 'env', varName: usernameVarName }),
    password_ref: chooseSecretRef({ strategy: 'env', varName: passwordVarName }),
    mfa: mfaBlock,
  };

  process.stdout.write('\nNote: set these env vars before starting the server:\n');
  process.stdout.write(`  export ${usernameVarName}="your-username"\n`);
  process.stdout.write(`  export ${passwordVarName}="your-password"\n`);
  if (mfaStrategy === 'totp') {
    process.stdout.write('  export BRIGHTSPACE_TOTP_SECRET="your-totp-base32-secret"\n');
  }
}

async function configureSessionCookie(
  auth: Record<string, unknown>,
  ctx: OutputContext,
): Promise<void> {
  process.stdout.write('\nSession cookie strategy: log in manually in your browser,\n');
  process.stdout.write('then copy the D2L cookies (d2lSessionVal + d2lSecureSessionVal).\n\n');

  const cookieRef = await promptCookieRef(ctx);
  auth['session_cookie'] = { cookie_ref: cookieRef };

  if (cookieRef.startsWith('env:')) {
    const varName = cookieRef.replace('env:', '');
    process.stdout.write(`\nBefore starting the server, run:\n`);
    process.stdout.write(`  export ${varName}="d2lSessionVal=XXX; d2lSecureSessionVal=YYY"\n`);
    process.stdout.write('\nTo get the cookie: log in → DevTools → Application → Cookies\n');
  }
}
