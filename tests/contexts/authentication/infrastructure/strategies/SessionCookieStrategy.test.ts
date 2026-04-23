import { describe, it, expect } from 'vitest';
import { SessionCookieStrategy } from '@/contexts/authentication/infrastructure/strategies/SessionCookieStrategy';
import { UserId } from '@/shared-kernel/types/UserId';
import { FakeCredentialStore } from '@tests/helpers/fakes/FakeCredentialStore';

describe('SessionCookieStrategy', () => {
  const whoami = async () => ({
    userId: UserId.of(7),
    displayName: 'Seven',
    uniqueName: 's@x',
  });

  it('authenticates with a stored cookie and returns a cookie-kind token', async () => {
    const credStore = new FakeCredentialStore({ 'keychain:svc/cookie': 'd2l=abc; path=/;' });
    const strat = new SessionCookieStrategy({
      cookieRef: 'keychain:svc/cookie',
      credentialStore: credStore,
      whoami,
      sessionTtlMs: 60_000,
    });
    const sess = await strat.authenticate({ profile: 'p', baseUrl: 'https://x' });
    expect(sess.source).toBe('session_cookie');
    expect(sess.token.kind).toBe('cookie');
    expect(sess.token.reveal()).toBe('d2l=abc; path=/;');
    expect(sess.userIdentity.displayName).toBe('Seven');
  });

  it('throws AuthConfigError when cookie ref is missing', async () => {
    const credStore = new FakeCredentialStore({});
    const strat = new SessionCookieStrategy({
      cookieRef: 'env:MISSING',
      credentialStore: credStore,
      whoami,
      sessionTtlMs: 60_000,
    });
    await expect(strat.authenticate({ profile: 'p', baseUrl: 'https://x' })).rejects.toThrow(/cookie/i);
  });

  it('canRefresh is false (manual cookie rotation)', () => {
    const strat = new SessionCookieStrategy({
      cookieRef: 'env:X',
      credentialStore: new FakeCredentialStore({ 'env:X': 'c' }),
      whoami,
      sessionTtlMs: 60_000,
    });
    expect(strat.canRefresh()).toBe(false);
  });
});
