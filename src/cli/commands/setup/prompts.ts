import { input, password, select } from '@inquirer/prompts';

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

export async function promptBaseUrl(): Promise<string> {
  return input({
    message: 'Brightspace base URL (e.g. https://school.brightspace.com):',
    validate: validateBaseUrl,
  });
}

export async function promptAuthStrategy(): Promise<string> {
  return select({
    message: 'Auth strategy:',
    choices: [
      { name: 'API Token (simplest, requires Valence token)', value: 'api_token' },
      { name: 'Browser (Playwright, solves MFA automatically)', value: 'browser' },
      { name: 'Session Cookie (paste cookies from browser)', value: 'session_cookie' },
    ],
  });
}

export async function promptBrowserPreset(): Promise<'simple' | 'microsoft_sso' | 'custom'> {
  return select({
    message: 'Login form type:',
    choices: [
      { name: 'Microsoft SSO (Azure AD — common for universities)', value: 'microsoft_sso' },
      { name: 'Simple form (username + password on same page)', value: 'simple' },
      { name: 'Custom (enter selectors manually)', value: 'custom' },
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
    post_login: '.d2l-navigation',
  };
}

export async function promptSimpleSelectors(): Promise<{
  username: string;
  password: string;
  submit: string;
  mfa_input: string;
  mfa_submit: string;
  post_login: string;
}> {
  return {
    username: await input({ message: 'CSS selector for username field:', default: '#username' }),
    password: await input({ message: 'CSS selector for password field:', default: '#password' }),
    submit: await input({ message: 'CSS selector for submit button:', default: 'button[type=submit]' }),
    mfa_input: await input({ message: 'CSS selector for MFA code input (leave blank if no MFA):' }),
    mfa_submit: await input({ message: 'CSS selector for MFA submit button:' }),
    post_login: await input({ message: 'CSS selector visible after login (to confirm success):', default: '.d2l-navigation' }),
  };
}

export async function promptLoginUrl(): Promise<string> {
  return input({
    message: 'Login page URL (where Brightspace redirects for authentication):',
    validate: (v) => v.startsWith('http') ? true : 'Must be a full URL',
  });
}

export async function promptUsernameRef(): Promise<string> {
  return input({
    message: 'Username env var name (will be stored as env:NAME):',
    default: 'BRIGHTSPACE_USERNAME',
  });
}

export async function promptPasswordRef(): Promise<string> {
  return input({
    message: 'Password env var name (will be stored as env:NAME):',
    default: 'BRIGHTSPACE_PASSWORD',
  });
}

export async function promptUsername(): Promise<string> {
  return input({ message: 'Your username / email:' });
}

export async function promptPasswordValue(): Promise<string> {
  return password({ message: 'Your password:', mask: '*' });
}

export async function promptApiToken(): Promise<string> {
  return password({ message: 'Paste your Valence API token:', mask: '*' });
}

export async function promptMfaStrategy(): Promise<string> {
  return select({
    message: 'MFA strategy:',
    choices: [
      { name: 'None (no MFA required)', value: 'none' },
      { name: 'TOTP (RFC 6238 — authenticator app)', value: 'totp' },
      { name: 'Duo Push (poll for mobile approval)', value: 'duo_push' },
      { name: 'Manual Prompt (paste code when asked)', value: 'manual_prompt' },
    ],
  });
}

export async function promptTotpSecret(): Promise<string> {
  return password({
    message: 'TOTP secret (base32, from QR code or setup key):',
    mask: '*',
    validate: validateTotpSecret,
  });
}

export async function promptCookieRef(): Promise<string> {
  return select({
    message: 'Where to read the session cookie from:',
    choices: [
      { name: 'Environment variable BRIGHTSPACE_COOKIE', value: 'env:BRIGHTSPACE_COOKIE' },
      { name: 'System keychain (keychain:brightspace-mcp/cookie)', value: 'keychain:brightspace-mcp/cookie' },
    ],
  });
}
