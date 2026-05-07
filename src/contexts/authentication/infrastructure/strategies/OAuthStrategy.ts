import { createHash, randomBytes } from 'node:crypto';
import type {
  AuthStrategy,
  AuthContext,
} from '@/contexts/authentication/domain/AuthStrategy.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';
import type { UserIdentity } from '@/contexts/authentication/domain/UserIdentity.js';
import type { CredentialStore } from '@/contexts/authentication/domain/CredentialStore.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

export type BrowserLauncher = (url: string) => Promise<void>;

export interface CallbackResult {
  code: string;
  state: string;
}

export type AwaitCallback = (redirectUri: string) => Promise<CallbackResult>;

export type WhoAmI = (token: AccessToken, baseUrl: string) => Promise<UserIdentity>;

export interface OAuthStrategyOptions {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecretRef: string | null;
  redirectUri: string;
  scopes: string[];
  credentialStore: CredentialStore;
  refreshTokenRef: string;
  browserLauncher: BrowserLauncher;
  awaitCallback: AwaitCallback;
  makeState?: () => string;
  makeVerifier?: () => string;
  whoami: WhoAmI;
  tokenTimeoutMs?: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export class OAuthStrategy implements AuthStrategy {
  readonly kind = 'oauth' as const;

  constructor(private readonly opts: OAuthStrategyOptions) {}

  private async secretForRef(ref: string | null): Promise<string | null> {
    if (!ref) return null;
    const s = await this.opts.credentialStore.get(ref);
    return s ? s.reveal() : null;
  }

  private async exchange(
    params: Record<string, string>,
  ): Promise<TokenResponse> {
    const body = new URLSearchParams(params);
    const clientSecret = await this.secretForRef(this.opts.clientSecretRef);
    if (clientSecret) body.set('client_secret', clientSecret);
    const resp = await fetch(this.opts.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(this.opts.tokenTimeoutMs ?? 15_000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`OAuth token endpoint ${resp.status}: ${text.slice(0, 200)}`);
    }
    return (await resp.json()) as TokenResponse;
  }

  async authenticate(ctx: AuthContext): Promise<Session> {
    const existing = await this.opts.credentialStore.get(this.opts.refreshTokenRef);
    if (existing) {
      return this.doRefresh(ctx, existing.reveal());
    }

    const state = this.opts.makeState ? this.opts.makeState() : base64url(randomBytes(16));
    const verifier =
      this.opts.makeVerifier ? this.opts.makeVerifier() : base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());

    const authorize = new URL(this.opts.authorizeUrl);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', this.opts.clientId);
    authorize.searchParams.set('redirect_uri', this.opts.redirectUri);
    authorize.searchParams.set('scope', this.opts.scopes.join(' '));
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');

    await this.opts.browserLauncher(authorize.toString());
    const { code, state: returnedState } = await this.opts.awaitCallback(this.opts.redirectUri);
    if (returnedState !== state) throw new Error('OAuth state mismatch (possible CSRF)');

    const token = await this.exchange({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.opts.redirectUri,
      client_id: this.opts.clientId,
      code_verifier: verifier,
    });
    if (token.refresh_token) {
      await this.opts.credentialStore.set(
        this.opts.refreshTokenRef,
        new SecretValue(token.refresh_token),
      );
    }
    const identity = await this.opts.whoami(AccessToken.bearer(token.access_token), ctx.baseUrl);
    const now = new Date();
    return {
      token: AccessToken.bearer(token.access_token),
      profile: ctx.profile,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + token.expires_in * 1000),
      source: this.kind,
      userIdentity: identity,
    };
  }

  canRefresh(_session: Session): boolean { return true; }

  async refresh(session: Session): Promise<Session> {
    const refreshToken = await this.secretForRef(this.opts.refreshTokenRef);
    if (!refreshToken) throw new Error('No refresh token available');
    return this.doRefresh({ profile: session.profile, baseUrl: '' }, refreshToken, session.userIdentity);
  }

  private async doRefresh(
    ctx: AuthContext,
    refreshToken: string,
    preservedIdentity?: UserIdentity,
  ): Promise<Session> {
    const token = await this.exchange({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.opts.clientId,
    });
    if (token.refresh_token && token.refresh_token !== refreshToken) {
      await this.opts.credentialStore.set(
        this.opts.refreshTokenRef,
        new SecretValue(token.refresh_token),
      );
    }
    const accessToken = AccessToken.bearer(token.access_token);
    const identity = preservedIdentity ?? (await this.opts.whoami(accessToken, ctx.baseUrl));
    const now = new Date();
    return {
      token: accessToken,
      profile: ctx.profile,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + token.expires_in * 1000),
      source: this.kind,
      userIdentity: identity,
    };
  }
}
