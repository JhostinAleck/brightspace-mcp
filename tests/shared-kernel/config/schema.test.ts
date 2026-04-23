import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '@/shared-kernel/config/schema.js';
import { DEFAULT_CONFIG } from '@/shared-kernel/config/defaults.js';

describe('ConfigSchema', () => {
  it('accepts DEFAULT_CONFIG', () => {
    expect(() => ConfigSchema.parse(DEFAULT_CONFIG)).not.toThrow();
  });
  it('requires default_profile', () => {
    const bad: Record<string, unknown> = { ...DEFAULT_CONFIG };
    delete bad['default_profile'];
    expect(() => ConfigSchema.parse(bad)).toThrow();
  });
  it('rejects unknown auth strategy', () => {
    const bad = structuredClone(DEFAULT_CONFIG) as unknown as {
      profiles: { default: { auth: { strategy: string } } };
    };
    bad.profiles.default.auth.strategy = 'magic';
    expect(() => ConfigSchema.parse(bad)).toThrow();
  });

  it('accepts a profile with browser strategy and totp MFA', () => {
    const cfg = {
      default_profile: 'p',
      profiles: {
        p: {
          base_url: 'https://x.com',
          auth: {
            strategy: 'browser',
            fallbacks: [],
            browser: {
              login_url: 'https://x.com/login',
              selectors: {
                username: '#user', password: '#pw', submit: '#submit',
                mfa_input: '#code', mfa_submit: '#mfa-submit', post_login: '#home',
              },
              username_ref: 'env:U',
              password_ref: 'env:P',
              headless: true,
              mfa: {
                strategy: 'totp',
                totp: { secret_ref: 'keychain:svc/totp', digits: 6, period: 30, algorithm: 'SHA1' },
              },
            },
          },
        },
      },
    };
    expect(() => ConfigSchema.parse(cfg)).not.toThrow();
  });

  it('accepts a profile with oauth strategy', () => {
    const cfg = {
      default_profile: 'p',
      profiles: {
        p: {
          base_url: 'https://x.com',
          auth: {
            strategy: 'oauth',
            fallbacks: [],
            oauth: {
              authorize_url: 'https://x.com/oauth/authorize',
              token_url: 'https://x.com/oauth/token',
              client_id: 'c',
              client_secret_ref: null,
              redirect_uri: 'http://localhost:6789/callback',
              scopes: ['core:*:*'],
              refresh_token_ref: 'file:creds/refresh-p',
            },
          },
        },
      },
    };
    expect(() => ConfigSchema.parse(cfg)).not.toThrow();
  });

  it('rejects totp mfa missing secret_ref', () => {
    const cfg = {
      default_profile: 'p',
      profiles: {
        p: {
          base_url: 'https://x.com',
          auth: {
            strategy: 'browser',
            fallbacks: [],
            browser: {
              login_url: 'https://x.com/login',
              selectors: { username: '#u', password: '#p', submit: '#s', mfa_input: '#m', mfa_submit: '#ms', post_login: '#h' },
              username_ref: 'env:U',
              password_ref: 'env:P',
              headless: true,
              mfa: { strategy: 'totp', totp: { digits: 6, period: 30, algorithm: 'SHA1' } },
            },
          },
        },
      },
    };
    expect(() => ConfigSchema.parse(cfg)).toThrow();
  });
});

describe('writes config block', () => {
  it('defaults writes.enabled to false and writes.dry_run to false', () => {
    const parsed = ConfigSchema.parse({
      default_profile: 'p',
      profiles: {
        p: {
          base_url: 'https://x.com',
          auth: { strategy: 'api_token', api_token: { token_ref: 'env:X' } },
        },
      },
    });
    expect(parsed.writes).toEqual({ enabled: false, dry_run: false });
  });

  it('accepts explicit writes.enabled true', () => {
    const parsed = ConfigSchema.parse({
      default_profile: 'p',
      profiles: {
        p: {
          base_url: 'https://x.com',
          auth: { strategy: 'api_token', api_token: { token_ref: 'env:X' } },
        },
      },
      writes: { enabled: true, dry_run: true },
    });
    expect(parsed.writes.enabled).toBe(true);
    expect(parsed.writes.dry_run).toBe(true);
  });
});
