import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Config, Profile } from '@/shared-kernel/config/schema.js';
import { StructuredLogger } from '@/shared-kernel/logging/StructuredLogger.js';
import type { CredentialStore } from '@/contexts/authentication/domain/CredentialStore.js';
import type { SessionCache } from '@/contexts/authentication/domain/SessionCache.js';
import type { MfaStrategy } from '@/contexts/authentication/domain/MfaStrategy.js';
import type { AuthStrategy } from '@/contexts/authentication/domain/AuthStrategy.js';
import { EnvVarCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/EnvVarCredentialStore.js';
import { KeychainCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/KeychainCredentialStore.js';
import { EncryptedFileCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/EncryptedFileCredentialStore.js';
import { CompositeCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/CompositeCredentialStore.js';
import { InMemorySessionCache } from '@/contexts/authentication/infrastructure/session-caches/InMemorySessionCache.js';
import { FileSessionCache } from '@/contexts/authentication/infrastructure/session-caches/FileSessionCache.js';
import { NoMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/NoMfaStrategy.js';
import { TotpMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/TotpMfaStrategy.js';
import { ManualPromptMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/ManualPromptMfaStrategy.js';
import { DuoPushMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/DuoPushMfaStrategy.js';
import { ApiTokenStrategy } from '@/contexts/authentication/infrastructure/strategies/ApiTokenStrategy.js';
import { SessionCookieStrategy } from '@/contexts/authentication/infrastructure/strategies/SessionCookieStrategy.js';
import { HeadlessPasswordStrategy } from '@/contexts/authentication/infrastructure/strategies/HeadlessPasswordStrategy.js';
import { OAuthStrategy } from '@/contexts/authentication/infrastructure/strategies/OAuthStrategy.js';
import { BrowserAuthStrategy } from '@/contexts/authentication/infrastructure/strategies/BrowserAuthStrategy.js';
import { createPlaywrightLoader } from '@/contexts/authentication/infrastructure/strategies/lazy-playwright.js';
import type { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';
import { EnsureAuthenticated } from '@/contexts/authentication/application/EnsureAuthenticated.js';
import { ConfigBackedStrategyResolver } from '@/contexts/authentication/application/ConfigBackedStrategyResolver.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { discoverVersions } from '@/contexts/http-api/VersionDiscovery.js';
import { callWhoAmI } from '@/contexts/http-api/whoami.js';
import { D2lCourseRepository } from '@/contexts/courses/infrastructure/D2lCourseRepository.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import { FileCache } from '@/shared-kernel/cache/FileCache.js';
import { LayeredCache } from '@/shared-kernel/cache/LayeredCache.js';
import { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache.js';
import { CachedCourseRepository } from '@/contexts/courses/infrastructure/CachedCourseRepository.js';
import { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import { RequestCoalescer } from '@/contexts/http-api/resilience/RequestCoalescer.js';
import { Bulkhead } from '@/contexts/http-api/resilience/Bulkhead.js';
import type { ToolDeps } from '@/mcp/registry.js';
import type { AuthStrategyKind } from '@/contexts/authentication/domain/Session.js';
import type { Prompter } from '@/contexts/authentication/infrastructure/mfa/ManualPromptMfaStrategy.js';

export interface BuildDependenciesInput {
  config: Config;
  encryptedFilePassphrase?: SecretValue;
  prompter?: Prompter;
}

async function buildCredentialStore(
  input: BuildDependenciesInput,
): Promise<CredentialStore> {
  const env = new EnvVarCredentialStore(process.env);
  const keychain = new KeychainCredentialStore();
  const file: CredentialStore = input.encryptedFilePassphrase
    ? new EncryptedFileCredentialStore({
        path: join(homedir(), '.brightspace-mcp', 'credentials.enc'),
        passphrase: input.encryptedFilePassphrase,
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

async function buildSessionCache(profile: Profile): Promise<SessionCache> {
  if (profile.session.cache_backend === 'file') {
    const path = profile.session.file_path ?? join(homedir(), '.brightspace-mcp', 'sessions.json');
    return new FileSessionCache({ path });
  }
  if (profile.session.cache_backend === 'redis') {
    throw new Error('redis session cache is not available until Plan 3');
  }
  return new InMemorySessionCache();
}

async function buildStrategies(
  profile: Profile,
  _profileName: string,
  baseUrl: string,
  credStore: CredentialStore,
  input: BuildDependenciesInput,
): Promise<Partial<Record<AuthStrategyKind, AuthStrategy>>> {
  const out: Partial<Record<AuthStrategyKind, AuthStrategy>> = {};
  const whoami = (token: Parameters<typeof callWhoAmI>[0]) => callWhoAmI(token, baseUrl);

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
    const mfa = buildMfa(profile.auth.headless.mfa, credStore, input.prompter);
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
        throw new Error('OAuth interactive callback listener is not implemented in Plan 2. Run the oauth callback helper separately.');
      },
      whoami,
    });
  }
  if (profile.auth.browser) {
    const mfa = buildMfa(profile.auth.browser.mfa, credStore, input.prompter);
    out.browser = new BrowserAuthStrategy({
      loginUrl: profile.auth.browser.login_url,
      selectors: {
        username: profile.auth.browser.selectors.username,
        password: profile.auth.browser.selectors.password,
        submit: profile.auth.browser.selectors.submit,
        mfaInput: profile.auth.browser.selectors.mfa_input,
        mfaSubmit: profile.auth.browser.selectors.mfa_submit,
        postLogin: profile.auth.browser.selectors.post_login,
      },
      usernameRef: profile.auth.browser.username_ref,
      passwordRef: profile.auth.browser.password_ref,
      credentialStore: credStore,
      mfa,
      playwrightLoader: createPlaywrightLoader(),
      headless: profile.auth.browser.headless,
      whoami,
      sessionTtlMs: profile.auth.browser.session_ttl_seconds * 1000,
    });
  }
  return out;
}

export async function buildDependencies(input: BuildDependenciesInput): Promise<ToolDeps> {
  const { config } = input;
  const profileName = config.default_profile;
  const profile = config.profiles[profileName];
  if (!profile) throw new Error(`Profile "${profileName}" not defined in config`);
  if (!profile.base_url) throw new Error(`Profile "${profileName}" missing base_url`);

  const logger = new StructuredLogger(config.logging.level);
  const baseUrl = profile.base_url;
  const credStore = await buildCredentialStore(input);
  const sessionCache = await buildSessionCache(profile);

  const strategies = await buildStrategies(profile, profileName, baseUrl, credStore, input);

  const resolver = new ConfigBackedStrategyResolver({
    profile,
    strategies,
    autoDetect: {
      apiTokenEnvPresent: profile.auth.api_token
        ? (await credStore.get(profile.auth.api_token.token_ref)) !== null
        : false,
      sessionCookieConfigured: profile.auth.session_cookie
        ? (await credStore.get(profile.auth.session_cookie.cookie_ref)) !== null
        : false,
      oauthRefreshTokenStored: profile.auth.oauth
        ? (await credStore.get(profile.auth.oauth.refresh_token_ref)) !== null
        : false,
      browserRunnable: !!profile.auth.browser,
    },
  });

  const ensureAuth = new EnsureAuthenticated(sessionCache, resolver);

  const metrics = new MetricsRegistry();
  const httpCacheBacking = new InMemoryCache();
  const httpCache = new HttpResponseCache(httpCacheBacking);
  const domainCacheBacking = new LayeredCache({
    memory: new InMemoryCache(),
    persistent: new FileCache({ path: join(homedir(), '.brightspace-mcp', 'domain-cache.json') }),
  });

  const apiClient = new D2lApiClient({
    baseUrl,
    getToken: async () => (await ensureAuth.execute({ profile: profileName, baseUrl })).token,
    retry: { maxAttempts: 3, initialMs: 250, maxMs: 5_000 },
    circuit: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    coalescer: new RequestCoalescer(),
    bulkhead: new Bulkhead({ maxConcurrent: 5 }),
    cache: httpCache,
    cacheTtlMs: 60_000,
  });

  const versions = await discoverVersions(baseUrl);
  logger.info('Discovered D2L API versions', { lp: versions.lp, le: versions.le });

  const rawCourseRepo = new D2lCourseRepository(apiClient, { le: versions.le });
  const courseRepo = new CachedCourseRepository(rawCourseRepo, domainCacheBacking, {
    listTtlMs: 5 * 60 * 1000,
    byIdTtlMs: 10 * 60 * 1000,
  });

  return {
    ensureAuth,
    profile: profileName,
    baseUrl,
    courseRepo,
    httpCache,
    domainCaches: { courses: domainCacheBacking },
    metrics,
    staticInfo: { profile: profileName, baseUrl, versions: { lp: versions.lp, le: versions.le } },
  };
}
