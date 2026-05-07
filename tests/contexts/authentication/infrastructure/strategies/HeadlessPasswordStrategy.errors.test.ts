import { afterEach, describe, expect, it } from 'vitest';
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

const baseOpts = (overrides: Record<string, unknown>) => ({
  loginUrl: 'https://x.com/login',
  usernameRef: 'env:U',
  passwordRef: 'env:P',
  credentialStore: new FakeCredentialStore({ 'env:U': 'a', 'env:P': 'p' }),
  mfa: new NoMfaStrategy(),
  whoami,
  sessionTtlMs: 60_000,
  ...overrides,
});

describe('HeadlessPasswordStrategy error paths', () => {
  it('throws AuthConfigError when login response is mfa_required but mfaUrl is missing', async () => {
    nock('https://x.com').post('/login').reply(200, { status: 'mfa_required', mfaType: 'totp' });
    const strat = new HeadlessPasswordStrategy(baseOpts({}));
    await expect(
      strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' }),
    ).rejects.toThrow(/mfaUrl/i);
  });

  it('rejects unknown login statuses with the server-supplied value in the message', async () => {
    nock('https://x.com').post('/login').reply(200, { status: 'pending_review' });
    const strat = new HeadlessPasswordStrategy(baseOpts({}));
    await expect(
      strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' }),
    ).rejects.toThrow(/pending_review/);
  });

  it('surfaces a clear error when MFA submission returns non-2xx', async () => {
    nock('https://x.com')
      .post('/login')
      .reply(200, { status: 'mfa_required', mfaType: 'totp' }, { 'set-cookie': 'pre=mfa' })
      .post('/mfa')
      .reply(401, 'unauthorised');

    const strat = new HeadlessPasswordStrategy(baseOpts({
      mfa: new FakeMfaStrategy('totp', { code: '000000' }),
      mfaUrl: 'https://x.com/mfa',
    }));
    await expect(
      strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' }),
    ).rejects.toThrow(/MFA submission failed: HTTP 401/);
  });

  it('rejects login attempts that return a non-2xx status', async () => {
    nock('https://x.com').post('/login').reply(503, 'down');
    const strat = new HeadlessPasswordStrategy(baseOpts({}));
    await expect(
      strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' }),
    ).rejects.toThrow(/Login failed: HTTP 503/);
  });

  it('falls back to the single-header set-cookie when getSetCookie is unavailable', async () => {
    // Some Response polyfills only expose `headers.get('set-cookie')`. Verify
    // the strategy still authenticates in that environment.
    nock('https://x.com')
      .post('/login')
      .reply(200, { status: 'ok' }, { 'set-cookie': 'd2lSession=fallback-path' });
    const strat = new HeadlessPasswordStrategy(baseOpts({}));
    const sess = await strat.authenticate({ profile: 'p', baseUrl: 'https://x.com' });
    expect(sess.token.reveal()).toContain('d2lSession=fallback-path');
  });

  it('canRefresh always returns false (refresh is the caller\'s job)', () => {
    const strat = new HeadlessPasswordStrategy(baseOpts({}));
    expect(strat.canRefresh()).toBe(false);
  });
});
