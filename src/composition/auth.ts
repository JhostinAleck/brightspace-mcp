import type { Config, Profile } from '@/shared-kernel/config/schema.js';
import { Paths } from '@/shared-kernel/config/paths.js';
import type { RedisLikeClient } from '@/shared-kernel/cache/RedisCache.js';
import type { createPlaywrightLoader } from '@/shared-kernel/playwright/lazy-playwright.js';
import type { CredentialStore } from '@/contexts/authentication/domain/CredentialStore.js';
import type { SessionCache } from '@/contexts/authentication/domain/SessionCache.js';
import type { MfaStrategy } from '@/contexts/authentication/domain/MfaStrategy.js';
import type { AuthStrategy } from '@/contexts/authentication/domain/AuthStrategy.js';
import type { AuthStrategyKind } from '@/contexts/authentication/domain/Session.js';
import type { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';
import { ConfigBackedStrategyResolver } from '@/contexts/authentication/application/ConfigBackedStrategyResolver.js';
import { EnvVarCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/EnvVarCredentialStore.js';
import { KeychainCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/KeychainCredentialStore.js';
import { EncryptedFileCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/EncryptedFileCredentialStore.js';
import { CompositeCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/CompositeCredentialStore.js';
import { InMemorySessionCache } from '@/contexts/authentication/infrastructure/session-caches/InMemorySessionCache.js';
import { FileSessionCache } from '@/contexts/authentication/infrastructure/session-caches/FileSessionCache.js';
import { RedisSessionCache } from '@/contexts/authentication/infrastructure/session-caches/RedisSessionCache.js';
import { NoMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/NoMfaStrategy.js';
import { TotpMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/TotpMfaStrategy.js';
import { ManualPromptMfaStrategy, type Prompter } from '@/contexts/authentication/infrastructure/mfa/ManualPromptMfaStrategy.js';
import { DuoPushMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/DuoPushMfaStrategy.js';
import { ApiTokenStrategy } from '@/contexts/authentication/infrastructure/strategies/ApiTokenStrategy.js';
import { SessionCookieStrategy } from '@/contexts/authentication/infrastructure/strategies/SessionCookieStrategy.js';
import { HeadlessPasswordStrategy } from '@/contexts/authentication/infrastructure/strategies/HeadlessPasswordStrategy.js';
import { OAuthStrategy } from '@/contexts/authentication/infrastructure/strategies/OAuthStrategy.js';
import { BrowserAuthStrategy } from '@/contexts/authentication/infrastructure/strategies/BrowserAuthStrategy.js';
import { callWhoAmI } from '@/contexts/http-api/whoami.js';

export async function buildCredentialStore(
  encryptedFilePassphrase: SecretValue | undefined,
): Promise<CredentialStore> {
  const env = new EnvVarCredentialStore(process.env);
  const keychain = new KeychainCredentialStore();
  const file: CredentialStore = encryptedFilePassphrase
    ? new EncryptedFileCredentialStore({
        path: Paths.credentialsEnc(),
        passphrase: encryptedFilePassphrase,
      })
    : {
        async get(_key: string) {
          throw new Error(
            'file: secret refs require an encrypted-file passphrase. Pass encryptedFilePassphrase to buildDependencies or use keychain:/env: refs instead.',
          );
        },
        async set(_key: string, _value: SecretValue): Promise<void> {
          throw new Error('file: store not configured');
        },
        async delete(_key: string): Promise<void> {
          throw new Error('file: store not configured');
        },
      };
  return new CompositeCredentialStore({ env, keychain, file });
}

function buildMfa(
  profileMfa: NonNullable<Profile['auth']['browser']>['mfa'] | undefined,
  credStore: CredentialStore,
  prompter: Prompter | undefined,
): MfaStrategy {
  const kind = profileMfa?.strategy ?? 'none';
  if (kind === 'none') return new NoMfaStrategy();
  if (kind === 'totp') {
    const totp = profileMfa!.totp!;
    return {
      kind: 'totp',
      async solve(challenge) {
        const secret = await credStore.get(totp.secret_ref);
        if (!secret) throw new Error(`TOTP secret not found at ref "${totp.secret_ref}"`);
        const real = new TotpMfaStrategy({
          secret,
          digits: totp.digits,
          period: totp.period,
          algorithm: totp.algorithm,
        });
        return real.solve(challenge);
      },
    };
  }
  if (kind === 'manual_prompt') {
    if (!prompter) {
      throw new Error('manual_prompt MFA requires a prompter to be passed to buildDependencies');
    }
    return new ManualPromptMfaStrategy(prompter);
  }
  if (kind === 'duo_push') {
    const duo = profileMfa!.duo_push!;
    return new DuoPushMfaStrategy({
      pollIntervalMs: duo.poll_interval_ms,
      timeoutMs: duo.timeout_ms,
    });
  }
  throw new Error(`Unsupported MFA strategy: "${kind}"`);
}

export async function buildSessionCache(
  profile: Profile,
  redisConfig: Config['redis'],
  redisLoader: (() => Promise<RedisLikeClient>) | null,
): Promise<SessionCache> {
  if (profile.session.cache_backend === 'file') {
    const path = profile.session.file_path ?? Paths.sessionsJson();
    return new FileSessionCache({ path });
  }
  if (profile.session.cache_backend === 'redis') {
    if (!redisConfig || !redisLoader) {
      throw new Error(
        'session.cache_backend=redis requires a [redis] section in config with at least a url.',
      );
    }
    return new RedisSessionCache({
      loader: redisLoader,
      keyPrefix: redisConfig.key_prefix,
    });
  }
  return new InMemorySessionCache();
}

export async function buildStrategies(
  profile: Profile,
  baseUrl: string,
  credStore: CredentialStore,
  prompter: Prompter | undefined,
  lpVersion: string,
  playwrightLoader: ReturnType<typeof createPlaywrightLoader>,
): Promise<Partial<Record<AuthStrategyKind, AuthStrategy>>> {
  const out: Partial<Record<AuthStrategyKind, AuthStrategy>> = {};
  const whoami = (token: Parameters<typeof callWhoAmI>[0]) => callWhoAmI(token, baseUrl, lpVersion);

  if (profile.auth.api_token) {
    out.api_token = new ApiTokenStrategy({
      tokenRef: profile.auth.api_token.token_ref,
      credentialStore: credStore,
      whoami,
    });
  }
  if (profile.auth.session_cookie) {
    out.session_cookie = new SessionCookieStrategy({
      cookieRef: profile.auth.session_cookie.cookie_ref,
      credentialStore: credStore,
      whoami,
      sessionTtlMs: profile.auth.session_cookie.session_ttl_seconds * 1000,
    });
  }
  if (profile.auth.headless) {
    const mfa = buildMfa(profile.auth.headless.mfa, credStore, prompter);
    out.headless = new HeadlessPasswordStrategy({
      loginUrl: profile.auth.headless.login_url,
      usernameRef: profile.auth.headless.username_ref,
      passwordRef: profile.auth.headless.password_ref,
      credentialStore: credStore,
      mfa,
      ...(profile.auth.headless.mfa_url !== undefined ? { mfaUrl: profile.auth.headless.mfa_url } : {}),
      whoami,
      sessionTtlMs: profile.auth.headless.session_ttl_seconds * 1000,
    });
  }
  if (profile.auth.oauth) {
    out.oauth = new OAuthStrategy({
      authorizeUrl: profile.auth.oauth.authorize_url,
      tokenUrl: profile.auth.oauth.token_url,
      clientId: profile.auth.oauth.client_id,
      clientSecretRef: profile.auth.oauth.client_secret_ref,
      redirectUri: profile.auth.oauth.redirect_uri,
      scopes: profile.auth.oauth.scopes,
      credentialStore: credStore,
      refreshTokenRef: profile.auth.oauth.refresh_token_ref,
      browserLauncher: async (url) => {
        process.stderr.write(`Open this URL in your browser to authorize: ${url}\n`);
      },
      awaitCallback: async () => {
        throw new Error(
          'OAuth interactive callback listener is not bundled with the server. Run the dedicated oauth callback helper out-of-band.',
        );
      },
      whoami,
    });
  }
  if (profile.auth.browser) {
    const mfa = buildMfa(profile.auth.browser.mfa, credStore, prompter);
    out.browser = new BrowserAuthStrategy({
      loginUrl: profile.auth.browser.login_url,
      selectors: {
        username: profile.auth.browser.selectors.username,
        password: profile.auth.browser.selectors.password,
        submit: profile.auth.browser.selectors.submit,
        ...(profile.auth.browser.selectors.password_submit !== undefined
          ? { passwordSubmit: profile.auth.browser.selectors.password_submit }
          : {}),
        preMfaClicks: profile.auth.browser.selectors.pre_mfa_clicks,
        postMfaClicks: profile.auth.browser.selectors.post_mfa_clicks,
        mfaInput: profile.auth.browser.selectors.mfa_input,
        mfaSubmit: profile.auth.browser.selectors.mfa_submit,
        postLogin: profile.auth.browser.selectors.post_login,
      },
      usernameRef: profile.auth.browser.username_ref,
      passwordRef: profile.auth.browser.password_ref,
      credentialStore: credStore,
      mfa,
      playwrightLoader,
      headless: profile.auth.browser.headless,
      whoami,
      sessionTtlMs: profile.auth.browser.session_ttl_seconds * 1000,
    });
  }
  return out;
}

/**
 * Resolves which configured strategy to use. Auto-detection probes the
 * credential store so a profile with several strategies picks the one that
 * actually has credentials available.
 */
export async function buildStrategyResolver(
  profile: Profile,
  strategies: Partial<Record<AuthStrategyKind, AuthStrategy>>,
  credStore: CredentialStore,
): Promise<ConfigBackedStrategyResolver> {
  const hasSecret = async (ref: string | undefined) =>
    ref !== undefined && (await credStore.get(ref)) !== null;
  return new ConfigBackedStrategyResolver({
    profile,
    strategies,
    autoDetect: {
      apiTokenEnvPresent: await hasSecret(profile.auth.api_token?.token_ref),
      sessionCookieConfigured: await hasSecret(profile.auth.session_cookie?.cookie_ref),
      oauthRefreshTokenStored: await hasSecret(profile.auth.oauth?.refresh_token_ref),
      browserRunnable: !!profile.auth.browser,
    },
  });
}
