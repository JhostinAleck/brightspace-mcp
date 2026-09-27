import type { Config } from '@/shared-kernel/config/schema.js';
import { Paths } from '@/shared-kernel/config/paths.js';
import { Disposables } from '@/shared-kernel/lifecycle/Disposables.js';
import { StructuredLogger } from '@/shared-kernel/logging/StructuredLogger.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import { WritesGate } from '@/shared-kernel/writes/WritesGate.js';
import { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import { buildOutputContext } from '@/shared-kernel/output/index.js';
import { createPlaywrightLoader } from '@/shared-kernel/playwright/lazy-playwright.js';
import type { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';
import type { Prompter } from '@/contexts/authentication/infrastructure/mfa/ManualPromptMfaStrategy.js';
import { EnsureAuthenticated } from '@/contexts/authentication/application/EnsureAuthenticated.js';
import { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache.js';
import { PlaywrightPageRenderer } from '@/contexts/http-api/PlaywrightPageRenderer.js';
import type { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';
import { discoverVersions } from '@/contexts/http-api/VersionDiscovery.js';
import type { ToolDeps } from '@/mcp/registry.js';
import {
  buildCredentialStore,
  buildSessionCache,
  buildStrategies,
  buildStrategyResolver,
} from '@/composition/auth.js';
import { makeSharedRedisLoader } from '@/composition/redis.js';
import { buildStorage } from '@/composition/storage.js';
import { buildApiClient } from '@/composition/http.js';
import { buildRepositories } from '@/composition/repositories.js';

export interface BuildDependenciesInput {
  config: Config;
  encryptedFilePassphrase?: SecretValue;
  prompter?: Prompter;
  transportPolicy?: TransportPolicy;
  enableWrites?: boolean;
  /** Override the audit log path. Defaults to ~/.brightspace-mcp/audit.log.
   *  Pass a path inside a temp dir when running tests to avoid polluting the user's real log. */
  auditLogPathOverride?: string;
}

export interface BuiltDependencies extends ToolDeps {
  disposables: Disposables;
}

/**
 * Wires the whole server for the config's default profile. Each concern
 * (auth, storage, HTTP client, repositories) is built in src/composition/;
 * this function only sequences them — notably, D2L API versions are
 * discovered before auth strategies so whoami uses the live LP version.
 */
export async function buildDependencies(input: BuildDependenciesInput): Promise<BuiltDependencies> {
  const { config } = input;
  const profileName = config.default_profile;
  const profile = config.profiles[profileName];
  if (!profile) throw new Error(`Profile "${profileName}" not defined in config`);
  if (!profile.base_url) throw new Error(`Profile "${profileName}" missing base_url`);

  const logger = new StructuredLogger(config.logging.level);
  const baseUrl = profile.base_url;
  const disposables = new Disposables();
  const redisLoader = config.redis ? makeSharedRedisLoader(config.redis, disposables) : null;

  // --- Authentication
  const credStore = await buildCredentialStore(input.encryptedFilePassphrase);
  const sessionCache = await buildSessionCache(profile, config.redis, redisLoader);
  const versions = await discoverVersions(baseUrl);
  logger.info('Discovered D2L API versions', { lp: versions.lp, le: versions.le });
  const playwrightLoader = createPlaywrightLoader();
  const strategies = await buildStrategies(profile, baseUrl, credStore, input.prompter, versions.lp, playwrightLoader);
  const resolver = await buildStrategyResolver(profile, strategies, credStore);
  const ensureAuth = new EnsureAuthenticated(sessionCache, resolver);
  const getToken = async () => (await ensureAuth.execute({ profile: profileName, baseUrl })).token;
  const onAuthFailure = async () =>
    (await ensureAuth.reauthenticate({ profile: profileName, baseUrl })).token;

  // --- HTTP
  // With browser auth configured, a Playwright renderer enables scraping
  // JS-rendered pages; it keeps one reusable browser across renders.
  let pageRenderer: PlaywrightPageRenderer | undefined;
  if (profile.auth.browser) {
    const r = new PlaywrightPageRenderer(playwrightLoader, getToken, baseUrl);
    pageRenderer = r;
    disposables.add(() => r.dispose());
  }
  const metrics = new MetricsRegistry();
  const httpCache = new HttpResponseCache(new InMemoryCache());
  const apiClient = buildApiClient({
    baseUrl,
    getToken,
    onAuthFailure,
    metrics,
    httpCache,
    transportPolicy: input.transportPolicy,
    pageRenderer,
  });

  // --- Domain
  const { domainCache, idempotencyStore } = buildStorage(config.redis, redisLoader);
  const repos = buildRepositories({
    apiClient,
    versions,
    cache: domainCache,
    profile,
    baseUrl,
    getToken,
    playwrightLoader,
  });

  // --- Writes & audit
  // Writes gate: requires BOTH the config switch AND the --enable-writes CLI flag to open.
  const writesGate = new WritesGate({
    configEnabled: config.writes?.enabled ?? false,
    cliFlag: input.enableWrites ?? false,
    configDryRun: config.writes?.dry_run ?? false,
  });
  // Persisted next to the rest of the app's state so get_audit_log can surface history.
  const auditLogPath = input.auditLogPathOverride
    ?? process.env['BRIGHTSPACE_AUDIT_LOG']
    ?? `${Paths.rootDir()}/audit.log`;
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
    ...repos,
    httpCache,
    domainCaches: {
      courses: domainCache,
      grades: domainCache,
      assignments: domainCache,
      content: domainCache,
      communications: domainCache,
      calendar: domainCache,
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
