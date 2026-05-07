import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { OAuthStrategy } from '@/contexts/authentication/infrastructure/strategies/OAuthStrategy.js';
import { UserId } from '@/shared-kernel/types/UserId.js';
import { FakeCredentialStore } from '@tests/helpers/fakes/FakeCredentialStore.js';

afterEach(() => nock.cleanAll());

const whoami = async () => ({
  userId: UserId.of(42),
  displayName: 'O',
  uniqueName: 'o@x',
});

describe('OAuthStrategy', () => {
  it('runs Authorization Code + PKCE and returns a bearer session', async () => {
    nock('https://x.com')
      .post('/oauth/token', (body) =>
        body.grant_type === 'authorization_code' &&
        body.code === 'the-code' &&
        typeof body.code_verifier === 'string' &&
        body.client_id === 'client-1' &&
        body.redirect_uri === 'http://localhost:6789/callback',
      )
      .reply(200, { access_token: 'acc_1', refresh_token: 'ref_1', expires_in: 600 });

    const strat = new OAuthStrategy({
      authorizeUrl: 'https://x.com/oauth/authorize',
      tokenUrl: 'https://x.com/oauth/token',
      clientId: 'client-1',
      clientSecretRef: null,
      redirectUri: 'http://localhost:6789/callback',
      scopes: ['core:*:*'],
      credentialStore: new FakeCredentialStore({}),
      refreshTokenRef: 'file:creds/refresh-p',
      browserLauncher: async (_url) => { /* simulate a user clicking allow */ },
      awaitCallback: async () => ({ code: 'the-code', state: 'exp-state' }),
      makeState: () => 'exp-state',
      makeVerifier: () => 'v'.repeat(64),
      whoami,
    });
    const sess = await strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' });
    expect(sess.source).toBe('oauth');
    expect(sess.token.kind).toBe('bearer');
    expect(sess.token.reveal()).toBe('acc_1');
  });

  it('rejects when callback state does not match', async () => {
    const strat = new OAuthStrategy({
      authorizeUrl: 'https://x.com/oauth/authorize',
      tokenUrl: 'https://x.com/oauth/token',
      clientId: 'client-1',
      clientSecretRef: null,
      redirectUri: 'http://localhost:6789/callback',
      scopes: ['core:*:*'],
      credentialStore: new FakeCredentialStore({}),
      refreshTokenRef: 'file:creds/refresh-p',
      browserLauncher: async () => {},
      awaitCallback: async () => ({ code: 'c', state: 'attacker-state' }),
      makeState: () => 'our-state',
      makeVerifier: () => 'v'.repeat(64),
      whoami,
    });
    await expect(strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' })).rejects.toThrow(/state/i);
  });

  it('aborts token endpoint fetch if server exceeds tokenTimeoutMs', async () => {
    nock('https://x.com').post('/oauth/token').delay(500).reply(200, { access_token: 'a', expires_in: 600 });

    const strat = new OAuthStrategy({
      authorizeUrl: 'https://x.com/oauth/authorize',
      tokenUrl: 'https://x.com/oauth/token',
      clientId: 'client-1',
      clientSecretRef: null,
      redirectUri: 'http://localhost:6789/callback',
      scopes: ['core:*:*'],
      credentialStore: new FakeCredentialStore({}),
      refreshTokenRef: 'file:creds/refresh-p',
      browserLauncher: async () => {},
      awaitCallback: async () => ({ code: 'c', state: 's' }),
      makeState: () => 's',
      makeVerifier: () => 'v'.repeat(64),
      whoami,
      tokenTimeoutMs: 50,
    });
    await expect(strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' })).rejects.toThrow();
  });

  it('refresh() exchanges the stored refresh token for a new access token', async () => {
    nock('https://x.com')
      .post('/oauth/token', (body) =>
        body.grant_type === 'refresh_token' && body.refresh_token === 'ref_1',
      )
      .reply(200, { access_token: 'acc_2', refresh_token: 'ref_2', expires_in: 600 });

    const credStore = new FakeCredentialStore({ 'file:creds/refresh-p': 'ref_1' });
    const strat = new OAuthStrategy({
      authorizeUrl: 'https://x.com/oauth/authorize',
      tokenUrl: 'https://x.com/oauth/token',
      clientId: 'client-1',
      clientSecretRef: null,
      redirectUri: 'http://localhost:6789/callback',
      scopes: ['core:*:*'],
      credentialStore: credStore,
      refreshTokenRef: 'file:creds/refresh-p',
      browserLauncher: async () => {},
      awaitCallback: async () => { throw new Error('should not be called'); },
      makeState: () => 's',
      makeVerifier: () => 'v'.repeat(64),
      whoami,
    });
    const fake = {
      token: {} as never, profile: 'p', issuedAt: new Date(), expiresAt: new Date(Date.now() - 1),
      source: 'oauth' as const, userIdentity: { userId: UserId.of(1), displayName: 'x', uniqueName: 'x' },
    };
    const refreshed = await strat.refresh!(fake);
    expect(refreshed.token.reveal()).toBe('acc_2');
    expect(credStore.snapshot()['file:creds/refresh-p']).toBe('ref_2');
  });
});
