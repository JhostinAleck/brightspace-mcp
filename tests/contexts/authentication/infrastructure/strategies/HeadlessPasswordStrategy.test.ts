import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { HeadlessPasswordStrategy } from '@/contexts/authentication/infrastructure/strategies/HeadlessPasswordStrategy';
import { UserId } from '@/shared-kernel/types/UserId';
import { NoMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/NoMfaStrategy';
import { FakeCredentialStore } from '@tests/helpers/fakes/FakeCredentialStore';
import { FakeMfaStrategy } from '@tests/helpers/fakes/FakeMfaStrategy';

afterEach(() => nock.cleanAll());

const whoami = async () => ({
  userId: UserId.of(1),
  displayName: 'N',
  uniqueName: 'n@x',
});

describe('HeadlessPasswordStrategy', () => {
  it('posts credentials and captures the Set-Cookie session header (no MFA)', async () => {
    nock('https://x.com')
      .post('/login', (body) => body.username === 'alice' && body.password === 'pw')
      .reply(200, { status: 'ok' }, { 'set-cookie': 'd2lSession=ok; path=/; HttpOnly' });

    const strat = new HeadlessPasswordStrategy({
      loginUrl: 'https://x.com/login',
      usernameRef: 'env:U',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:U': 'alice', 'env:P': 'pw' }),
      mfa: new NoMfaStrategy(),
      whoami,
      sessionTtlMs: 60_000,
    });
    const sess = await strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' });
    expect(sess.source).toBe('headless');
    expect(sess.token.kind).toBe('cookie');
    expect(sess.token.reveal()).toContain('d2lSession=ok');
  });

  it('invokes MFA strategy when response asks for mfa code', async () => {
    nock('https://x.com')
      .post('/login')
      .reply(200, { status: 'mfa_required', mfaType: 'totp' }, {})
      .post('/mfa', (body) => body.code === '287082')
      .reply(200, { status: 'ok' }, { 'set-cookie': 'd2lSession=after-mfa; path=/' });

    const fakeMfa = new FakeMfaStrategy('totp', { code: '287082' });
    const strat = new HeadlessPasswordStrategy({
      loginUrl: 'https://x.com/login',
      usernameRef: 'env:U',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:U': 'a', 'env:P': 'p' }),
      mfa: fakeMfa,
      mfaUrl: 'https://x.com/mfa',
      whoami,
      sessionTtlMs: 60_000,
    });
    const sess = await strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' });
    expect(fakeMfa.seen).toHaveLength(1);
    expect(sess.token.reveal()).toContain('d2lSession=after-mfa');
  });

  it('throws AuthConfigError when username is missing from store', async () => {
    const strat = new HeadlessPasswordStrategy({
      loginUrl: 'https://x.com/login',
      usernameRef: 'env:MISSING',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:P': 'pw' }),
      mfa: new NoMfaStrategy(),
      whoami,
      sessionTtlMs: 60_000,
    });
    await expect(strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' })).rejects.toThrow(/username/i);
  });

  it('throws when login response has no Set-Cookie', async () => {
    nock('https://x.com').post('/login').reply(200, { status: 'ok' });
    const strat = new HeadlessPasswordStrategy({
      loginUrl: 'https://x.com/login',
      usernameRef: 'env:U',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:U': 'a', 'env:P': 'p' }),
      mfa: new NoMfaStrategy(),
      whoami,
      sessionTtlMs: 60_000,
    });
    await expect(strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' })).rejects.toThrow(/cookie|session/i);
  });
});
