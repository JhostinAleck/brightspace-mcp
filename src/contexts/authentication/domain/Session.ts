import type { AccessToken } from './AccessToken.js';
import type { UserIdentity } from './UserIdentity.js';

export type AuthStrategyKind = 'api_token' | 'browser' | 'oauth' | 'session_cookie' | 'headless';

export interface Session {
  readonly token: AccessToken;
  readonly profile: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly source: AuthStrategyKind;
  readonly userIdentity: UserIdentity;
}
