import { input, password, select } from '@inquirer/prompts';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export function validateBaseUrl(value: string): true | string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'not a valid URL';
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return true;
  }
  return 'base URL must be https:// (or http://localhost for local testing)';
}

const BASE32_ALPHABET = /^[A-Z2-7]+=*$/;

export function validateTotpSecret(value: string): true | string {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (!BASE32_ALPHABET.test(compact)) return 'TOTP secret must be base32 (A-Z, 2-7)';
  if (compact.replace(/=+$/, '').length < 16) return 'TOTP secret looks too short';
  return true;
}

export async function promptBaseUrl(ctx: OutputContext): Promise<string> {
  return input({ message: ctx.t('wizard.base_url'), validate: validateBaseUrl });
}

export async function promptAuthStrategy(ctx: OutputContext): Promise<string> {
  return select({
    message: ctx.t('wizard.auth_strategy'),
    choices: [
      { name: ctx.t('wizard.auth_api_token'), value: 'api_token' },
      { name: ctx.t('wizard.auth_browser'), value: 'browser' },
      { name: ctx.t('wizard.auth_headless'), value: 'headless' },
      { name: ctx.t('wizard.auth_session_cookie'), value: 'session_cookie' },
    ],
  });
}

export async function promptBrowserPreset(ctx: OutputContext): Promise<'simple' | 'microsoft_sso' | 'custom'> {
  return select({
    message: ctx.t('wizard.browser_preset'),
    choices: [
      { name: ctx.t('wizard.browser_microsoft'), value: 'microsoft_sso' },
      { name: ctx.t('wizard.browser_simple'), value: 'simple' },
      { name: ctx.t('wizard.browser_custom'), value: 'custom' },
    ],
  }) as Promise<'simple' | 'microsoft_sso' | 'custom'>;
}

export function buildMicrosoftSsoSelectors(): {
  username: string;
  password: string;
  submit: string;
  password_submit: string;
  pre_mfa_clicks: string[];
  mfa_input: string;
  mfa_submit: string;
  post_login: string;
} {
  return {
    username: '#i0116',
    password: '#i0118',
    submit: '#idSIButton9',
    password_submit: '#idSIButton9',
    pre_mfa_clicks: [
      "a:has-text(\"can't use\")",
      'div[role="button"]:has-text("Use a verification code")',
    ],
    mfa_input: '#idTxtBx_SAOTCC_OTC',
    mfa_submit: '#idSubmit_SAOTCC_Continue',
    post_login: 'd2l-labs-navigation',
  };
}

export async function promptSimpleSelectors(ctx: OutputContext): Promise<{
  username: string;
  password: string;
  submit: string;
  mfa_input: string;
  mfa_submit: string;
  post_login: string;
}> {
  return {
    username: await input({ message: ctx.t('wizard.selector_username'), default: '#username' }),
    password: await input({ message: ctx.t('wizard.selector_password'), default: '#password' }),
    submit: await input({ message: ctx.t('wizard.selector_submit'), default: 'button[type=submit]' }),
    mfa_input: await input({ message: ctx.t('wizard.selector_mfa_input') }),
    mfa_submit: await input({ message: ctx.t('wizard.selector_mfa_submit') }),
    post_login: await input({ message: ctx.t('wizard.selector_post_login'), default: '.d2l-navigation' }),
  };
}

export async function promptLoginUrl(ctx: OutputContext): Promise<string> {
  return input({
    message: ctx.t('wizard.login_url'),
    validate: (v) => v.startsWith('http') ? true : 'Must be a full URL',
  });
}

export async function promptUsernameRef(ctx: OutputContext): Promise<string> {
  return input({ message: ctx.t('wizard.username_ref'), default: 'BRIGHTSPACE_USERNAME' });
}

export async function promptPasswordRef(ctx: OutputContext): Promise<string> {
  return input({ message: ctx.t('wizard.password_ref'), default: 'BRIGHTSPACE_PASSWORD' });
}

export async function promptUsername(ctx: OutputContext): Promise<string> {
  return input({ message: ctx.t('wizard.username_value') });
}

export async function promptPasswordValue(ctx: OutputContext): Promise<string> {
  return password({ message: ctx.t('wizard.password_value'), mask: '*' });
}

export async function promptApiToken(ctx: OutputContext): Promise<string> {
  return password({ message: ctx.t('wizard.api_token_value'), mask: '*' });
}

export async function promptMfaStrategy(ctx: OutputContext): Promise<string> {
  return select({
    message: ctx.t('wizard.mfa_strategy'),
    choices: [
      { name: ctx.t('wizard.mfa_none'), value: 'none' },
      { name: ctx.t('wizard.mfa_totp'), value: 'totp' },
      { name: ctx.t('wizard.mfa_duo_push'), value: 'duo_push' },
      { name: ctx.t('wizard.mfa_manual'), value: 'manual_prompt' },
    ],
  });
}

export async function promptTotpSecret(ctx: OutputContext): Promise<string> {
  return password({ message: ctx.t('wizard.totp_secret'), mask: '*', validate: validateTotpSecret });
}

export async function promptCookieRef(ctx: OutputContext): Promise<string> {
  return select({
    message: ctx.t('wizard.cookie_source'),
    choices: [
      { name: ctx.t('wizard.cookie_env'), value: 'env:BRIGHTSPACE_COOKIE' },
      { name: ctx.t('wizard.cookie_keychain'), value: 'keychain:brightspace-mcp/cookie' },
    ],
  });
}
