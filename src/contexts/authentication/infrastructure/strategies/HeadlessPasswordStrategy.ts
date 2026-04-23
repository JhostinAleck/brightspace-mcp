import type {
  AuthStrategy,
  AuthContext,
} from '@/contexts/authentication/domain/AuthStrategy.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';
import type { UserIdentity } from '@/contexts/authentication/domain/UserIdentity.js';
import type { CredentialStore } from '@/contexts/authentication/domain/CredentialStore.js';
import type { MfaStrategy } from '@/contexts/authentication/domain/MfaStrategy.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { AuthConfigError } from '@/contexts/authentication/domain/errors.js';

export type WhoAmI = (token: AccessToken, baseUrl: string) => Promise<UserIdentity>;

export interface HeadlessPasswordStrategyOptions {
  loginUrl: string;
  usernameRef: string;
  passwordRef: string;
  credentialStore: CredentialStore;
  mfa: MfaStrategy;
  mfaUrl?: string;
  whoami: WhoAmI;
  sessionTtlMs: number;
}

interface LoginResponseBody {
  status: 'ok' | 'mfa_required' | string;
  mfaType?: 'totp' | 'duo_push' | 'prompt_text';
}

function extractSetCookies(response: Response): string {
  const raw = response.headers.get('set-cookie');
  return raw ?? '';
}

export class HeadlessPasswordStrategy implements AuthStrategy {
  readonly kind = 'headless' as const;

  constructor(private readonly opts: HeadlessPasswordStrategyOptions) {}

  private async resolveCredential(ref: string, label: string): Promise<string> {
    const v = await this.opts.credentialStore.get(ref);
    if (!v) throw new AuthConfigError(`${label} not found at ref "${ref}"`);
    return v.reveal();
  }

  async authenticate(ctx: AuthContext): Promise<Session> {
    const username = await this.resolveCredential(this.opts.usernameRef, 'username');
    const password = await this.resolveCredential(this.opts.passwordRef, 'password');

    const loginResp = await fetch(this.opts.loginUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!loginResp.ok) throw new Error(`Login failed: HTTP ${loginResp.status}`);
    const loginBody = (await loginResp.json()) as LoginResponseBody;
    let cookie = extractSetCookies(loginResp);

    if (loginBody.status === 'mfa_required') {
      if (!this.opts.mfaUrl) {
        throw new AuthConfigError('Tenant requested MFA but mfaUrl is not configured');
      }
      const challengeKind =
        loginBody.mfaType === 'duo_push'
          ? 'duo_push'
          : loginBody.mfaType === 'prompt_text'
            ? 'prompt_text'
            : 'totp_code';
      const response = await this.opts.mfa.solve({ kind: challengeKind });
      const mfaResp = await fetch(this.opts.mfaUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ code: response.code }),
      });
      if (!mfaResp.ok) throw new Error(`MFA submission failed: HTTP ${mfaResp.status}`);
      const mfaCookie = extractSetCookies(mfaResp);
      if (mfaCookie) cookie = mfaCookie;
    } else if (loginBody.status !== 'ok') {
      throw new Error(`Unexpected login status: "${loginBody.status}"`);
    }

    if (!cookie) throw new Error('Login succeeded but no session cookie returned');

    const token = AccessToken.cookie(cookie);
    const identity = await this.opts.whoami(token, ctx.baseUrl);
    const now = new Date();
    return {
      token,
      profile: ctx.profile,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + this.opts.sessionTtlMs),
      source: this.kind,
      userIdentity: identity,
    };
  }

  canRefresh(): boolean {
    return false;
  }
}
