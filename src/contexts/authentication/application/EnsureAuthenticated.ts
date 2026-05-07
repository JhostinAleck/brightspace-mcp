import type { AuthStrategy, AuthContext } from '@/contexts/authentication/domain/AuthStrategy.js';
import type { SessionCache } from '@/contexts/authentication/domain/SessionCache.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';
import type { ConfigBackedStrategyResolver } from './ConfigBackedStrategyResolver.js';
import { FallbackChainExhaustedError } from '@/contexts/authentication/domain/errors.js';

interface StrategyFailure {
  strategy: string;
  error: Error;
}

/**
 * AggregateAuthError carries every failure in the fallback chain so callers
 * can render a complete diagnosis ("api_token failed because X, oauth failed
 * because Y, browser failed because Z"). The `cause` chain points at the
 * first failure to preserve root-cause semantics for stderr-only consumers
 * that follow only `error.cause`.
 */
class AggregateAuthError extends Error {
  override readonly cause?: Error;
  readonly failures: ReadonlyArray<StrategyFailure>;

  constructor(failures: ReadonlyArray<StrategyFailure>) {
    super(
      failures.length === 0
        ? 'No authentication strategies were attempted.'
        : `All authentication strategies failed:\n${failures
            .map((f) => `  - ${f.strategy}: ${f.error.message}`)
            .join('\n')}`,
    );
    this.name = 'AggregateAuthError';
    this.failures = failures;
    if (failures.length > 0) this.cause = failures[0]!.error;
  }
}

export class EnsureAuthenticated {
  constructor(
    private readonly cache: SessionCache,
    private readonly resolverOrStrategy: ConfigBackedStrategyResolver | AuthStrategy,
  ) {}

  async execute(ctx: AuthContext): Promise<Session> {
    const cached = await this.cache.get(ctx.profile);
    if (cached) return cached;

    const chain = this.buildChain();
    const failures: StrategyFailure[] = [];
    for (const strategy of chain) {
      try {
        const fresh = await strategy.authenticate(ctx);
        await this.cache.save(ctx.profile, fresh);
        return fresh;
      } catch (err) {
        failures.push({
          strategy: strategy.kind,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
    throw new FallbackChainExhaustedError(
      new AggregateAuthError(failures).message,
      new AggregateAuthError(failures),
    );
  }

  async reauthenticate(ctx: AuthContext): Promise<Session> {
    await this.cache.invalidate(ctx.profile);
    return this.execute(ctx);
  }

  private buildChain(): AuthStrategy[] {
    if ('resolvePrimary' in this.resolverOrStrategy) {
      return [
        this.resolverOrStrategy.resolvePrimary(),
        ...this.resolverOrStrategy.resolveFallbacks(),
      ];
    }
    return [this.resolverOrStrategy];
  }
}
