import type { Session, AuthStrategyKind } from './Session.js';

export interface AuthContext {
  readonly profile: string;
  readonly baseUrl: string;
}

export interface AuthStrategy {
  readonly kind: AuthStrategyKind;
  authenticate(ctx: AuthContext): Promise<Session>;
  canRefresh(session: Session): boolean;
  refresh?(session: Session): Promise<Session>;
}
