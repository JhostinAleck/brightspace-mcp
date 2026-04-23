import type { Config } from './schema.js';

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
      base_url: 'https://example.brightspace.com',
    },
  },
  logging: { level: 'info' },
  writes: { enabled: false, dry_run: false },
};
