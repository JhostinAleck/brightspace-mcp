import { describe, it, expect } from 'vitest';
import { BrowserAuthStrategy } from '@/contexts/authentication/infrastructure/strategies/BrowserAuthStrategy';
import { UserId } from '@/shared-kernel/types/UserId';
import { NoMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/NoMfaStrategy';
import { FakeCredentialStore } from '@tests/helpers/fakes/FakeCredentialStore';
import { FakeMfaStrategy } from '@tests/helpers/fakes/FakeMfaStrategy';
import type {
  PlaywrightModule,
  PlaywrightPage,
} from '@/contexts/authentication/infrastructure/strategies/lazy-playwright';

const whoami = async () => ({
  userId: UserId.of(5),
  displayName: 'Five',
  uniqueName: 'five@x',
});

function makeFakePlaywright(opts: {
  hasMfaSelector?: boolean;
  cookies?: Array<{ name: string; value: string; domain: string; path: string }>;
  calls?: {
    gotos?: string[];
    fills?: Array<[string, string]>;
    clicks?: string[];
    waitedSelectors?: string[];
  };
}): PlaywrightModule {
  const cookies = opts.cookies ?? [{ name: 'd2lSession', value: 'fromBrowser', domain: 'x', path: '/' }];
  const calls = opts.calls ?? {};
  calls.gotos ??= [];
  calls.fills ??= [];
  calls.clicks ??= [];
  calls.waitedSelectors ??= [];
  let awaitedMfaOnce = !opts.hasMfaSelector;
  const page = {
    async goto(url: string) { calls.gotos!.push(url); },
    async fill(selector: string, value: string) { calls.fills!.push([selector, value]); },
    async click(selector: string) { calls.clicks!.push(selector); },
    async waitForSelector(selector: string) {
      calls.waitedSelectors!.push(selector);
      if (selector.includes('mfa') || selector.includes('code')) {
        if (!awaitedMfaOnce) { awaitedMfaOnce = true; return; }
        throw new Error('mfa selector no longer present');
      }
      return;
    },
    async content() { return '<html>landing</html>'; },
    async evaluate() { return ''; },
    context() { return { cookies: async () => cookies }; },
    async close() {},
  } as unknown as PlaywrightPage;
  return {
    chromium: {
      async launch() {
        return { newPage: async () => page, close: async () => {} };
      },
    },
  };
}

describe('BrowserAuthStrategy', () => {
  it('performs a non-MFA login and returns a cookie-kind session', async () => {
    const calls = { gotos: [] as string[], fills: [] as Array<[string, string]>, clicks: [] as string[] };
    const strat = new BrowserAuthStrategy({
      loginUrl: 'https://x/login',
      selectors: { username: '#user', password: '#pw', submit: '#submit', mfaInput: '#code', mfaSubmit: '#mfa-submit', postLogin: '#home' },
      usernameRef: 'env:U',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:U': 'a', 'env:P': 'b' }),
      mfa: new NoMfaStrategy(),
      playwrightLoader: async () => makeFakePlaywright({ calls }),
      headless: true,
      whoami,
      sessionTtlMs: 60_000,
    });
    const sess = await strat.authenticate({ profile: 'p', baseUrl: 'https://x' });
    expect(sess.source).toBe('browser');
    expect(sess.token.kind).toBe('cookie');
    expect(sess.token.reveal()).toContain('d2lSession=fromBrowser');
    expect(calls.gotos).toContain('https://x/login');
    expect(calls.fills).toContainEqual(['#user', 'a']);
    expect(calls.fills).toContainEqual(['#pw', 'b']);
  });

  it('invokes MFA strategy when mfaInput selector is present', async () => {
    const fakeMfa = new FakeMfaStrategy('totp', { code: '654321' });
    const strat = new BrowserAuthStrategy({
      loginUrl: 'https://x/login',
      selectors: { username: '#user', password: '#pw', submit: '#submit', mfaInput: '#code', mfaSubmit: '#mfa-submit', postLogin: '#home' },
      usernameRef: 'env:U',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:U': 'a', 'env:P': 'b' }),
      mfa: fakeMfa,
      playwrightLoader: async () => makeFakePlaywright({ hasMfaSelector: true }),
      headless: true,
      whoami,
      sessionTtlMs: 60_000,
    });
    const sess = await strat.authenticate({ profile: 'p', baseUrl: 'https://x' });
    expect(fakeMfa.seen).toHaveLength(1);
    expect(sess.token.reveal()).toContain('d2lSession=fromBrowser');
  });

  it('throws AuthConfigError when username is missing', async () => {
    const strat = new BrowserAuthStrategy({
      loginUrl: 'https://x/login',
      selectors: { username: '#u', password: '#p', submit: '#s', mfaInput: '#c', mfaSubmit: '#ms', postLogin: '#h' },
      usernameRef: 'env:MISSING',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:P': 'b' }),
      mfa: new NoMfaStrategy(),
      playwrightLoader: async () => makeFakePlaywright({}),
      headless: true,
      whoami,
      sessionTtlMs: 60_000,
    });
    await expect(strat.authenticate({ profile: 'p', baseUrl: 'https://x' })).rejects.toThrow(/username/i);
  });
});

describe('multi-step login', () => {
  it('clicks submit after username then waits for password in multi-step mode', async () => {
    const calls = { gotos: [] as string[], fills: [] as Array<[string, string]>, clicks: [] as string[], waitedSelectors: [] as string[] };
    const strat = new BrowserAuthStrategy({
      loginUrl: 'https://login.ms/saml',
      selectors: {
        username: '#i0116',
        password: '#i0118',
        submit: '#idSIButton9',
        passwordSubmit: '#idSIButton9',
        preMfaClicks: [],
        mfaInput: '#idTxtBx_SAOTCC_OTC',
        mfaSubmit: '#idSubmit_SAOTCC_Continue',
        postLogin: '.d2l-navigation',
      },
      usernameRef: 'env:U',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:U': 'user@uni.edu', 'env:P': 'secret' }),
      mfa: new NoMfaStrategy(),
      playwrightLoader: async () => makeFakePlaywright({ calls }),
      headless: true,
      whoami,
      sessionTtlMs: 60_000,
    });
    await strat.authenticate({ profile: 'p', baseUrl: 'https://x' });

    // username filled before first submit click
    const usernameIdx = calls.fills.findIndex(([s]) => s === '#i0116');
    const firstClickIdx = calls.clicks.indexOf('#idSIButton9');
    expect(usernameIdx).toBeGreaterThanOrEqual(0);
    expect(firstClickIdx).toBeGreaterThanOrEqual(0);

    // password waited and filled after first submit
    expect(calls.waitedSelectors).toContain('#i0118');
    const passwordIdx = calls.fills.findIndex(([s]) => s === '#i0118');
    expect(passwordIdx).toBeGreaterThan(usernameIdx);
  });

  it('clicks each preMfaClicks selector in order before MFA input', async () => {
    const calls = { gotos: [] as string[], fills: [] as Array<[string, string]>, clicks: [] as string[], waitedSelectors: [] as string[] };
    const fakeMfa = new FakeMfaStrategy('totp', { code: '123456' });
    const strat = new BrowserAuthStrategy({
      loginUrl: 'https://login.ms/saml',
      selectors: {
        username: '#i0116',
        password: '#i0118',
        submit: '#idSIButton9',
        passwordSubmit: '#idSIButton9',
        preMfaClicks: ['#pre-step-1', '#pre-step-2'],
        mfaInput: '#idTxtBx_SAOTCC_OTC',
        mfaSubmit: '#idSubmit_SAOTCC_Continue',
        postLogin: '.d2l-navigation',
      },
      usernameRef: 'env:U',
      passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:U': 'u', 'env:P': 'p' }),
      mfa: fakeMfa,
      playwrightLoader: async () => makeFakePlaywright({ hasMfaSelector: true, calls }),
      headless: true,
      whoami,
      sessionTtlMs: 60_000,
    });
    await strat.authenticate({ profile: 'p', baseUrl: 'https://x' });
    const pre1Idx = calls.clicks.indexOf('#pre-step-1');
    const pre2Idx = calls.clicks.indexOf('#pre-step-2');
    expect(pre1Idx).toBeGreaterThanOrEqual(0);
    expect(pre2Idx).toBeGreaterThanOrEqual(0);
    expect(pre1Idx).toBeLessThan(pre2Idx);
    expect(fakeMfa.seen).toHaveLength(1);
  });

  it('skips preMfaClicks selectors that time out', async () => {
    const clicked: string[] = [];
    const fakePw: PlaywrightModule = {
      chromium: {
        async launch() {
          return {
            newPage: async () => ({
              goto: async () => {},
              fill: async () => {},
              click: async (s: string) => { clicked.push(s); },
              waitForSelector: async (s: string, _opts?: { timeout?: number }) => {
                if (s === '#absent') throw new Error('timeout');
              },
              content: async () => '<html></html>',
              evaluate: async () => '',
              context: () => ({ cookies: async () => [{ name: 'd2l', value: 'x', domain: 'x', path: '/' }] }),
              close: async () => {},
            } as unknown as PlaywrightPage),
            close: async () => {},
          };
        },
      },
    };

    const strat = new BrowserAuthStrategy({
      loginUrl: 'https://x/login',
      selectors: {
        username: '#u', password: '#p', submit: '#s',
        passwordSubmit: '#s',
        preMfaClicks: ['#absent', '#present'],
        mfaInput: '#m', mfaSubmit: '#ms', postLogin: '#h',
      },
      usernameRef: 'env:U', passwordRef: 'env:P',
      credentialStore: new FakeCredentialStore({ 'env:U': 'u', 'env:P': 'p' }),
      mfa: new NoMfaStrategy(),
      playwrightLoader: async () => fakePw,
      headless: true, whoami, sessionTtlMs: 60_000,
    });

    await expect(strat.authenticate({ profile: 'p', baseUrl: 'https://x' })).resolves.toBeDefined();
    expect(clicked).not.toContain('#absent');
    expect(clicked).toContain('#present');
  });
});
