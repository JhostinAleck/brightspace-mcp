import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { isValidTz, detectSystemTz } from '@/shared-kernel/output/time/tz-detector.js';
import { detectSystemLocale, SUPPORTED_LOCALES, type SupportedLocale } from '@/shared-kernel/output/i18n/locale-detector.js';
import { buildMicrosoftSsoSelectors } from './setup/prompts.js';

export interface InitOptions {
  baseUrl: string;
  strategy: 'api_token' | 'browser' | 'headless' | 'session_cookie' | 'oauth';
  profile?: string;
  config?: string;
  tz?: string;
  locale?: SupportedLocale;
  force?: boolean;
  tokenRef?: string;
  usernameRef?: string;
  passwordRef?: string;
  loginUrl?: string;
  preset?: 'microsoft' | 'none';
  mfaStrategy?: 'none' | 'totp' | 'duo_push' | 'manual_prompt';
  totpSecretRef?: string;
  headless?: boolean;
  cookieRef?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  redirectUri?: string;
  scopes?: string;
  refreshTokenRef?: string;
}

const InitSchema = z
  .object({
    baseUrl: z.string().url(),
    strategy: z.enum(['api_token', 'browser', 'headless', 'session_cookie', 'oauth']),
    profile: z.string().default('default'),
    config: z.string().optional(),
    tz: z.string().optional(),
    locale: z.enum(SUPPORTED_LOCALES).optional(),
    force: z.boolean().default(false),
    tokenRef: z.string().optional(),
    usernameRef: z.string().optional(),
    passwordRef: z.string().optional(),
    loginUrl: z.string().optional(),
    preset: z.enum(['microsoft', 'none']).optional(),
    mfaStrategy: z.enum(['none', 'totp', 'duo_push', 'manual_prompt']).default('none'),
    totpSecretRef: z.string().optional(),
    headless: z.boolean().default(true),
    cookieRef: z.string().optional(),
    authorizeUrl: z.string().optional(),
    tokenUrl: z.string().optional(),
    clientId: z.string().optional(),
    redirectUri: z.string().optional(),
    scopes: z.string().optional(),
    refreshTokenRef: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.strategy === 'api_token' && !data.tokenRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '--token-ref is required when --strategy=api_token' });
    }
    if ((data.strategy === 'browser' || data.strategy === 'headless') && !data.usernameRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `--username-ref is required when --strategy=${data.strategy}` });
    }
    if ((data.strategy === 'browser' || data.strategy === 'headless') && !data.passwordRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `--password-ref is required when --strategy=${data.strategy}` });
    }
    if (data.strategy !== 'browser' && data.preset && data.preset !== 'none') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '--preset is only valid with --strategy=browser' });
    }
    if (data.mfaStrategy === 'totp' && !data.totpSecretRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '--totp-secret-ref is required when --mfa-strategy=totp' });
    }
    if (data.strategy === 'session_cookie' && !data.cookieRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '--cookie-ref is required when --strategy=session_cookie' });
    }
    if (data.strategy === 'oauth') {
      for (const [field, flag] of [
        ['authorizeUrl', '--authorize-url'],
        ['tokenUrl', '--token-url'],
        ['clientId', '--client-id'],
        ['redirectUri', '--redirect-uri'],
        ['scopes', '--scopes'],
        ['refreshTokenRef', '--refresh-token-ref'],
      ] as const) {
        if (!data[field]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${flag} is required when --strategy=oauth` });
        }
      }
    }
  });

function buildAuthBlock(opts: z.infer<typeof InitSchema>): Record<string, unknown> {
  const auth: Record<string, unknown> = { strategy: opts.strategy };
  const loginUrl = opts.loginUrl ?? `${opts.baseUrl.replace(/\/$/, '')}/d2l/login`;

  if (opts.strategy === 'api_token') {
    auth['api_token'] = { token_ref: opts.tokenRef };
  } else if (opts.strategy === 'browser') {
    const selectors: Record<string, unknown> = opts.preset === 'microsoft'
      ? buildMicrosoftSsoSelectors()
      : { username: '#username', password: '#password', submit: 'button[type=submit]', mfa_input: '', mfa_submit: '', post_login: '.d2l-navigation' };
    const mfaBlock: Record<string, unknown> = { strategy: opts.mfaStrategy };
    if (opts.mfaStrategy === 'totp') mfaBlock['totp'] = { secret_ref: opts.totpSecretRef };
    else if (opts.mfaStrategy === 'duo_push') mfaBlock['duo_push'] = {};
    auth['browser'] = { login_url: loginUrl, selectors, username_ref: opts.usernameRef, password_ref: opts.passwordRef, headless: opts.headless, mfa: mfaBlock };
  } else if (opts.strategy === 'headless') {
    const mfaBlock: Record<string, unknown> = { strategy: opts.mfaStrategy };
    if (opts.mfaStrategy === 'totp') mfaBlock['totp'] = { secret_ref: opts.totpSecretRef };
    else if (opts.mfaStrategy === 'duo_push') mfaBlock['duo_push'] = {};
    auth['headless'] = { login_url: loginUrl, username_ref: opts.usernameRef, password_ref: opts.passwordRef, mfa: mfaBlock };
  } else if (opts.strategy === 'session_cookie') {
    auth['session_cookie'] = { cookie_ref: opts.cookieRef };
  } else if (opts.strategy === 'oauth') {
    auth['oauth'] = {
      authorize_url: opts.authorizeUrl,
      token_url: opts.tokenUrl,
      client_id: opts.clientId,
      redirect_uri: opts.redirectUri,
      scopes: opts.scopes?.split(/[\s,]+/).filter(Boolean) ?? [],
      refresh_token_ref: opts.refreshTokenRef,
    };
  }
  return auth;
}

export async function runInit(rawOpts: InitOptions): Promise<void> {
  const parsed = InitSchema.safeParse(rawOpts);
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => i.message).join('\n  ');
    throw new Error(msgs);
  }
  const opts = parsed.data;

  const tz = opts.tz ?? detectSystemTz();
  if (!isValidTz(tz)) {
    throw new Error(
      `Invalid --tz: "${tz}". Use an IANA name (e.g. America/Bogota). ` +
      `Run: node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"`,
    );
  }
  const locale = opts.locale ?? detectSystemLocale();
  const configPath = opts.config ?? join(homedir(), '.brightspace-mcp', 'config.yaml');

  let existingConfig: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existingConfig = (parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>) ?? {};
    } catch {
      existingConfig = {};
    }
    const profiles = (existingConfig.profiles as Record<string, unknown>) ?? {};
    if (profiles[opts.profile] !== undefined && !opts.force) {
      if (!process.stdout.isTTY) {
        throw new Error(
          `Profile "${opts.profile}" already exists in ${configPath}. Re-run with --force to overwrite.`,
        );
      }
      const { input } = await import('@inquirer/prompts');
      const answer = await input({
        message: `Profile "${opts.profile}" already exists. Overwrite? (y/N):`,
        default: 'N',
      });
      if (answer.toLowerCase() !== 'y') {
        process.stdout.write('Aborted.\n');
        return;
      }
    }
  }

  const auth = buildAuthBlock(opts);
  const profile: Record<string, unknown> = { base_url: opts.baseUrl, auth };
  const profiles = ((existingConfig.profiles as Record<string, unknown>) ?? {});
  profiles[opts.profile] = profile;

  const config: Record<string, unknown> = {
    ...existingConfig,
    default_profile: existingConfig.default_profile ?? opts.profile,
    profiles,
    output: { tz, locale, format: 'markdown', include_meta_footer: true },
  };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, stringifyYaml(config), { encoding: 'utf8', mode: 0o600 });

  process.stdout.write(`✓ Config written to ${configPath}\n`);
  process.stdout.write(`  Profile: ${opts.profile}  Strategy: ${opts.strategy}\n\n`);
  process.stdout.write(`Next: brightspace-mcp serve --profile ${opts.profile}\n`);
}
