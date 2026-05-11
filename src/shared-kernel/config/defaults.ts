import type { Config } from './schema.js';

/**
 * Bare-minimum defaults used by `loadConfig` when no config file exists.
 * The `base_url` placeholder is intentionally a non-resolving hostname so
 * accidental requests fail loudly at DNS time rather than hitting a real
 * tenant. Users MUST override this via setup wizard or `config set`.
 */
export const DEFAULT_CONFIG: Config = {
  default_profile: 'default',
  profiles: {
    default: {
      auth: {
        strategy: 'api_token',
        fallbacks: [],
        api_token: { token_ref: 'env:BRIGHTSPACE_API_TOKEN' },
      },
      session: { cache_backend: 'memory', preemptive_refresh_seconds: 300 },
      base_url: 'https://placeholder.invalid',
    },
  },
  logging: { level: 'info' },
  writes: { enabled: false, dry_run: false },
  output: { format: 'markdown', include_meta_footer: true },
};
