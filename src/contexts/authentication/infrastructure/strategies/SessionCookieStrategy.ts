import type {
  AuthStrategy,
  AuthContext,
} from '@/contexts/authentication/domain/AuthStrategy.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';
import type { UserIdentity } from '@/contexts/authentication/domain/UserIdentity.js';
import type { CredentialStore } from '@/contexts/authentication/domain/CredentialStore.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { AuthConfigError } from '@/contexts/authentication/domain/errors.js';

export type WhoAmI = (token: AccessToken, baseUrl: string) => Promise<UserIdentity>;

export interface SessionCookieStrategyOptions {
  cookieRef: string;
  credentialStore: CredentialStore;
  whoami: WhoAmI;
  sessionTtlMs: number;
}

export class SessionCookieStrategy implements AuthStrategy {
  readonly kind = 'session_cookie' as const;

  constructor(private readonly opts: SessionCookieStrategyOptions) {}

  async authenticate(ctx: AuthContext): Promise<Session> {
    const secret = await this.opts.credentialStore.get(this.opts.cookieRef);
    if (!secret) {
      throw new AuthConfigError(
        `Session cookie not found at ref "${this.opts.cookieRef}". Paste the cookie into your credential store first.`,
      );
    }
    const token = AccessToken.cookie(secret.reveal());
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
