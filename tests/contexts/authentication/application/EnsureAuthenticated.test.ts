import { describe, it, expect } from 'vitest';
import { EnsureAuthenticated } from '@/contexts/authentication/application/EnsureAuthenticated.js';
import { InMemorySessionCache } from '@/contexts/authentication/infrastructure/session-caches/InMemorySessionCache.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { UserId } from '@/shared-kernel/types/UserId.js';
import type { AuthStrategy } from '@/contexts/authentication/domain/AuthStrategy.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';

const makeStrategy = () => {
  let calls = 0;
  const strategy: AuthStrategy = {
    kind: 'api_token',
    async authenticate(ctx) {
      calls++;
      return {
        token: AccessToken.bearer('t'),
        profile: ctx.profile,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        source: 'api_token',
        userIdentity: { userId: UserId.of(1), displayName: 'U', uniqueName: 'u' },
      } satisfies Session;
    },
    canRefresh() { return false; },
  };
  return { strategy, getCalls: () => calls };
};

describe('EnsureAuthenticated', () => {
  it('calls strategy on cache miss, caches result', async () => {
    const cache = new InMemorySessionCache();
    const { strategy, getCalls } = makeStrategy();
    const uc = new EnsureAuthenticated(cache, strategy);
    const s1 = await uc.execute({ profile: 'p', baseUrl: 'https://x' });
    const s2 = await uc.execute({ profile: 'p', baseUrl: 'https://x' });
    expect(s1.profile).toBe('p');
    expect(s2.profile).toBe('p');
    expect(getCalls()).toBe(1);
  });
});
