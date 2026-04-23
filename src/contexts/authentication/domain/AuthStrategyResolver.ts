import type { AuthStrategy, AuthContext } from './AuthStrategy.js';

export interface AuthStrategyResolver {
  resolve(ctx: AuthContext): Promise<AuthStrategy>;
}
