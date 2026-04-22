import type { AuthStrategy, AuthContext } from '@/contexts/authentication/domain/AuthStrategy.js';
import type { SessionCache } from '@/contexts/authentication/domain/SessionCache.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';

export class EnsureAuthenticated {
  constructor(
    private readonly cache: SessionCache,
    private readonly strategy: AuthStrategy,
  ) {}

  async execute(ctx: AuthContext): Promise<Session> {
    const cached = await this.cache.get(ctx.profile);
    if (cached) return cached;
    const fresh = await this.strategy.authenticate(ctx);
    await this.cache.save(ctx.profile, fresh);
    return fresh;
  }

  async reauthenticate(ctx: AuthContext): Promise<Session> {
    await this.cache.invalidate(ctx.profile);
    return this.execute(ctx);
  }
}
