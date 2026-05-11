import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config, Profile } from '@/shared-kernel/config/schema.js';
import { Paths } from '@/shared-kernel/config/paths.js';
import { Disposables } from '@/shared-kernel/lifecycle/Disposables.js';
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
import { RedisSessionCache } from '@/contexts/authentication/infrastructure/session-caches/RedisSessionCache.js';
import { NoMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/NoMfaStrategy.js';
import { TotpMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/TotpMfaStrategy.js';
import { ManualPromptMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/ManualPromptMfaStrategy.js';
import { DuoPushMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/DuoPushMfaStrategy.js';
import { ApiTokenStrategy } from '@/contexts/authentication/infrastructure/strategies/ApiTokenStrategy.js';
import { SessionCookieStrategy } from '@/contexts/authentication/infrastructure/strategies/SessionCookieStrategy.js';
import { HeadlessPasswordStrategy } from '@/contexts/authentication/infrastructure/strategies/HeadlessPasswordStrategy.js';
import { OAuthStrategy } from '@/contexts/authentication/infrastructure/strategies/OAuthStrategy.js';
import { BrowserAuthStrategy } from '@/contexts/authentication/infrastructure/strategies/BrowserAuthStrategy.js';
import { createPlaywrightLoader } from '@/shared-kernel/playwright/lazy-playwright.js';
import type { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';
import { EnsureAuthenticated } from '@/contexts/authentication/application/EnsureAuthenticated.js';
import { ConfigBackedStrategyResolver } from '@/contexts/authentication/application/ConfigBackedStrategyResolver.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { PlaywrightPageRenderer } from '@/contexts/http-api/PlaywrightPageRenderer.js';
import type { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';
import { discoverVersions } from '@/contexts/http-api/VersionDiscovery.js';
import { callWhoAmI } from '@/contexts/http-api/whoami.js';
import { D2lCourseRepository } from '@/contexts/courses/infrastructure/D2lCourseRepository.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import { FileCache } from '@/shared-kernel/cache/FileCache.js';
import { LayeredCache } from '@/shared-kernel/cache/LayeredCache.js';
import { RedisCache, type RedisLikeClient } from '@/shared-kernel/cache/RedisCache.js';
import { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache.js';
import { CachedCourseRepository } from '@/contexts/courses/infrastructure/CachedCourseRepository.js';
import { D2lGradeRepository } from '@/contexts/grades/infrastructure/D2lGradeRepository.js';
import { CachedGradeRepository } from '@/contexts/grades/infrastructure/CachedGradeRepository.js';
import { D2lAssignmentRepository } from '@/contexts/assignments/infrastructure/D2lAssignmentRepository.js';
import { D2lUiSubmitter } from '@/contexts/assignments/infrastructure/D2lUiSubmitter.js';
import { D2lQuizRepository } from '@/contexts/quizzes/infrastructure/D2lQuizRepository.js';
import { D2lGroupRepository } from '@/contexts/groups/infrastructure/D2lGroupRepository.js';
import { D2lNotificationRepository } from '@/contexts/notifications/infrastructure/D2lNotificationRepository.js';
import { CachedAssignmentRepository } from '@/contexts/assignments/infrastructure/CachedAssignmentRepository.js';
import { D2lContentRepository } from '@/contexts/content/infrastructure/D2lContentRepository.js';
import { CachedContentRepository } from '@/contexts/content/infrastructure/CachedContentRepository.js';
import { D2lCommunicationsRepository } from '@/contexts/communications/infrastructure/D2lCommunicationsRepository.js';
import { CachedCommunicationsRepository } from '@/contexts/communications/infrastructure/CachedCommunicationsRepository.js';
import { D2lCalendarRepository } from '@/contexts/calendar/infrastructure/D2lCalendarRepository.js';
import { CachedCalendarRepository } from '@/contexts/calendar/infrastructure/CachedCalendarRepository.js';
import { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import { RequestCoalescer } from '@/contexts/http-api/resilience/RequestCoalescer.js';
import { Bulkhead } from '@/contexts/http-api/resilience/Bulkhead.js';
import { WritesGate } from '@/shared-kernel/writes/WritesGate.js';
import { CachedIdempotencyStore } from '@/shared-kernel/idempotency/CachedIdempotencyStore.js';
import { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import type { ToolDeps } from '@/mcp/registry.js';
import { buildOutputContext } from '@/shared-kernel/output/index.js';
import type { AuthStrategyKind } from '@/contexts/authentication/domain/Session.js';
import type { Prompter } from '@/contexts/authentication/infrastructure/mfa/ManualPromptMfaStrategy.js';

export interface BuildDependenciesInput {
  config: Config;
  encryptedFilePassphrase?: SecretValue;
  prompter?: Prompter;
  transportPolicy?: TransportPolicy;
  enableWrites?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedPackageVersion: string | null = null;
function readPackageVersion(): string {
  if (cachedPackageVersion) return cachedPackageVersion;
  // composition-root sits at build/composition-root.js → ../package.json
  const candidates = [
    join(__dirname, '..', 'package.json'),
    join(__dirname, '..', '..', 'package.json'),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf8')) as { version?: string };
      if (pkg.version) {
        cachedPackageVersion = pkg.version;
        return cachedPackageVersion;
      }
    } catch {
      /* try next candidate */
    }
  }
  cachedPackageVersion = '0.0.0';
  return cachedPackageVersion;
}

async function buildCredentialStore(
  input: BuildDependenciesInput,
): Promise<CredentialStore> {
  const env = new EnvVarCredentialStore(process.env);
  const keychain = new KeychainCredentialStore();
  const file: CredentialStore = input.encryptedFilePassphrase
    ? new EncryptedFileCredentialStore({
        path: Paths.credentialsEnc(),
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

/**
 * Single Redis client per build. Previously each consumer
 * (sessions, domain cache, idempotency) called `buildRedisLoader` on the
 * same config separately, opening N connections and exposing N orphaned
 * sockets on shutdown. Now we share one connection and register a single
 * `quit()` disposer.
 */
function makeSharedRedisLoader(
  redisConfig: NonNullable<Config['redis']>,
  disposables: Disposables,
): () => Promise<RedisLikeClient> {
  let clientPromise: Promise<RedisLikeClient> | null = null;
  return () => {
    if (!clientPromise) {
      clientPromise = (async () => {
        const ioredis = await import('ioredis').catch(() => {
          throw new Error('ioredis is not installed. Run: npm install ioredis');
        });
        const client = new ioredis.Redis(redisConfig.url) as unknown as RedisLikeClient;
        disposables.add(async () => {
          try {
            await client.quit();
          } catch {
            /* best-effort */
          }
        });
        return client;
      })();
    }
    return clientPromise;
  };
}

async function buildSessionCache(
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

async function buildStrategies(
  profile: Profile,
  _profileName: string,
  baseUrl: string,
  credStore: CredentialStore,
  input: BuildDependenciesInput,
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
        throw new Error(
          'OAuth interactive callback listener is not bundled with the server. Run the dedicated oauth callback helper out-of-band.',
        );
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

export interface BuiltDependencies extends ToolDeps {
  disposables: Disposables;
}

export async function buildDependencies(input: BuildDependenciesInput): Promise<BuiltDependencies> {
  const { config } = input;
  const profileName = config.default_profile;
  const profile = config.profiles[profileName];
  if (!profile) throw new Error(`Profile "${profileName}" not defined in config`);
  if (!profile.base_url) throw new Error(`Profile "${profileName}" missing base_url`);

  const logger = new StructuredLogger(config.logging.level);
  const baseUrl = profile.base_url;
  const credStore = await buildCredentialStore(input);

  const disposables = new Disposables();
  const redisLoader = config.redis ? makeSharedRedisLoader(config.redis, disposables) : null;

  const sessionCache = await buildSessionCache(profile, config.redis, redisLoader);

  // Discover versions BEFORE building strategies so whoami uses the live LP.
  const versions = await discoverVersions(baseUrl);
  logger.info('Discovered D2L API versions', { lp: versions.lp, le: versions.le });

  const playwrightLoader = createPlaywrightLoader();

  const strategies = await buildStrategies(
    profile,
    profileName,
    baseUrl,
    credStore,
    input,
    versions.lp,
    playwrightLoader,
  );

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
  const persistentDomainCache = redisLoader
    ? new RedisCache({
        loader: redisLoader,
        keyPrefix: `${config.redis!.key_prefix}domain:`,
      })
    : new FileCache({ path: Paths.domainCacheJson() });
  const domainCacheBacking = new LayeredCache({
    memory: new InMemoryCache(),
    persistent: persistentDomainCache,
  });

  const getToken = async () => (await ensureAuth.execute({ profile: profileName, baseUrl })).token;
  const onAuthFailure = async () =>
    (await ensureAuth.reauthenticate({ profile: profileName, baseUrl })).token;

  // Wire up Playwright renderer when browser auth is configured — enables
  // JS-rendered page scraping. The renderer keeps a reusable browser singleton
  // so consecutive renders skip the Chromium launch cost.
  let pageRenderer: PlaywrightPageRenderer | undefined;
  if (profile.auth.browser) {
    const r = new PlaywrightPageRenderer(playwrightLoader, getToken, baseUrl);
    pageRenderer = r;
    disposables.add(() => r.dispose());
  }

  const userAgent = `brightspace-mcp/${readPackageVersion()} (+https://github.com/JhostinAleck/brightspace-mcp)`;
  const apiClient = new D2lApiClient({
    baseUrl,
    getToken,
    onAuthFailure,
    userAgent,
    metrics,
    retry: { maxAttempts: 3, initialMs: 250, maxMs: 5_000 },
    circuit: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    coalescer: new RequestCoalescer(),
    bulkhead: new Bulkhead({ maxConcurrent: 5 }),
    cache: httpCache,
    cacheTtlMs: 60_000,
    ...(input.transportPolicy ? { transportPolicy: input.transportPolicy } : {}),
    ...(pageRenderer ? { pageRenderer } : {}),
  });

  const rawCourseRepo = new D2lCourseRepository(apiClient, { le: versions.le, lp: versions.lp });
  const courseRepo = new CachedCourseRepository(rawCourseRepo, domainCacheBacking, {
    listTtlMs: 5 * 60 * 1000,
    byIdTtlMs: 10 * 60 * 1000,
  });

  const rawGradeRepo = new D2lGradeRepository(apiClient, { le: versions.le });
  const gradeRepo = new CachedGradeRepository(rawGradeRepo, domainCacheBacking, { ttlMs: 60 * 1000 });

  // UI submitter (Playwright fallback for tenants where the Valence API is
  // restricted). Always wired but lazy: playwrightLoader is only invoked when
  // .submit() is actually called, so read-only flows never pay for it.
  // Selectors and locale come from `profile.ui_submit` if set; otherwise the
  // submitter falls back to its English-first defaults (which work for stock
  // Brightspace tenants).
  const uiSubmitCfg = profile.ui_submit;
  const cfgSelectors = uiSubmitCfg?.selectors;
  const uiSubmitter = new D2lUiSubmitter({
    playwrightLoader,
    baseUrl,
    le: versions.le,
    getToken,
    headless: profile.auth.browser?.headless ?? true,
    ...(cfgSelectors
      ? {
          selectors: {
            ...(cfgSelectors.add_file_button !== undefined ? { addFileButton: cfgSelectors.add_file_button } : {}),
            ...(cfgSelectors.my_computer_link !== undefined ? { myComputerLink: cfgSelectors.my_computer_link } : {}),
            ...(cfgSelectors.upload_button !== undefined ? { uploadButton: cfgSelectors.upload_button } : {}),
            ...(cfgSelectors.commit_button !== undefined ? { commitButton: cfgSelectors.commit_button } : {}),
            ...(cfgSelectors.submit_button !== undefined ? { submitButton: cfgSelectors.submit_button } : {}),
            ...(cfgSelectors.confirm_button !== undefined ? { confirmButton: cfgSelectors.confirm_button } : {}),
          },
        }
      : {}),
    ...(uiSubmitCfg?.force_locale !== undefined ? { forceLocale: uiSubmitCfg.force_locale } : {}),
  });
  const rawAssignmentRepo = new D2lAssignmentRepository(
    apiClient,
    { le: versions.le },
    uiSubmitter,
  );
  const assignmentRepo = new CachedAssignmentRepository(rawAssignmentRepo, domainCacheBacking, {
    listTtlMs: 60 * 1000,
    feedbackTtlMs: 5 * 60 * 1000,
  });

  const rawContentRepo = new D2lContentRepository(apiClient, { le: versions.le });
  const contentRepo = new CachedContentRepository(rawContentRepo, domainCacheBacking, {
    syllabusTtlMs: 15 * 60 * 1000,
    modulesTtlMs: 5 * 60 * 1000,
  });

  const rawCommunicationsRepo = new D2lCommunicationsRepository(apiClient, { le: versions.le });
  const communicationsRepo = new CachedCommunicationsRepository(rawCommunicationsRepo, domainCacheBacking, {
    announcementsTtlMs: 60 * 1000,
    discussionsTtlMs: 2 * 60 * 1000,
  });

  const rawCalendarRepo = new D2lCalendarRepository(apiClient, { le: versions.le });
  const calendarRepo = new CachedCalendarRepository(rawCalendarRepo, domainCacheBacking, {
    ttlMs: 5 * 60 * 1000,
  });

  const quizRepo = new D2lQuizRepository(apiClient, { le: versions.le });
  const groupRepo = new D2lGroupRepository(apiClient, { lp: versions.lp });
  const notificationRepo = new D2lNotificationRepository(apiClient, { lp: versions.lp });

  // Writes gate: requires BOTH the config switch AND the --enable-writes CLI flag to open.
  const writesGate = new WritesGate({
    configEnabled: config.writes?.enabled ?? false,
    cliFlag: input.enableWrites ?? false,
    configDryRun: config.writes?.dry_run ?? false,
  });

  const idempotencyBacking = redisLoader
    ? new RedisCache({
        loader: redisLoader,
        keyPrefix: `${config.redis!.key_prefix}idm:`,
      })
    : new FileCache({ path: Paths.idempotencyJson() });
  const idempotencyStore = new CachedIdempotencyStore(idempotencyBacking);
  // Persist audit log to disk so the get_audit_log tool can surface history.
  // Path lives next to the rest of the app's state (~/.brightspace-mcp/).
  const auditLogPath = `${Paths.rootDir()}/audit.log`;
  const auditLogger = new AuditLogger({ logger, filePath: auditLogPath });

  const output = buildOutputContext({
    ...(config.output?.tz !== undefined ? { tz: config.output.tz } : {}),
    ...(config.output?.locale !== undefined ? { locale: config.output.locale } : {}),
    format: config.output?.format ?? 'markdown',
    includeMetaFooter: config.output?.include_meta_footer ?? true,
  });

  return {
    ensureAuth,
    profile: profileName,
    baseUrl,
    courseRepo,
    gradeRepo,
    assignmentRepo,
    contentRepo,
    communicationsRepo,
    calendarRepo,
    quizRepo,
    groupRepo,
    notificationRepo,
    httpCache,
    domainCaches: {
      courses: domainCacheBacking,
      grades: domainCacheBacking,
      assignments: domainCacheBacking,
      content: domainCacheBacking,
      communications: domainCacheBacking,
      calendar: domainCacheBacking,
    },
    metrics,
    staticInfo: { profile: profileName, baseUrl, versions: { lp: versions.lp, le: versions.le } },
    writesGate,
    idempotencyStore,
    auditLogger,
    auditLogPath,
    output,
    disposables,
  };
}
