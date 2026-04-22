import { describe, it, expect } from 'vitest';
import { InMemorySessionCache } from '@/contexts/authentication/infrastructure/session-caches/InMemorySessionCache.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { UserId } from '@/shared-kernel/types/UserId.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';

const sess = (profile: string, expiresAt: Date): Session => ({
  token: AccessToken.bearer('x'),
  profile,
  issuedAt: new Date(),
  expiresAt,
  source: 'api_token',
  userIdentity: { userId: UserId.of(1), displayName: 'U', uniqueName: 'u@x' },
});

describe('InMemorySessionCache', () => {
  it('stores and retrieves a valid session', async () => {
    const c = new InMemorySessionCache();
    const s = sess('p', new Date(Date.now() + 60_000));
    await c.save('p', s);
    expect((await c.get('p'))?.profile).toBe('p');
  });
  it('returns null for expired session', async () => {
    const c = new InMemorySessionCache();
    await c.save('p', sess('p', new Date(Date.now() - 1)));
    expect(await c.get('p')).toBeNull();
  });
  it('invalidate removes entry', async () => {
    const c = new InMemorySessionCache();
    await c.save('p', sess('p', new Date(Date.now() + 60_000)));
    await c.invalidate('p');
    expect(await c.get('p')).toBeNull();
  });
});
