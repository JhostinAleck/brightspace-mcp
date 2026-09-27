import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import type { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import type { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache.js';
import type { PlaywrightPageRenderer } from '@/contexts/http-api/PlaywrightPageRenderer.js';
import type { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';
import { RequestCoalescer } from '@/contexts/http-api/resilience/RequestCoalescer.js';
import { Bulkhead } from '@/contexts/http-api/resilience/Bulkhead.js';
import { readPackageVersion } from '@/shared-kernel/updates/packageVersion.js';

export interface ApiClientInput {
  baseUrl: string;
  getToken: () => Promise<AccessToken>;
  onAuthFailure: () => Promise<AccessToken>;
  metrics: MetricsRegistry;
  httpCache: HttpResponseCache;
  transportPolicy: TransportPolicy | undefined;
  pageRenderer: PlaywrightPageRenderer | undefined;
}

/** D2L client with the production resilience stack (retry, breaker, bulkhead, coalescing, 60s cache). */
export function buildApiClient(input: ApiClientInput): D2lApiClient {
  return new D2lApiClient({
    baseUrl: input.baseUrl,
    getToken: input.getToken,
    onAuthFailure: input.onAuthFailure,
    userAgent: `brightspace-mcp/${readPackageVersion()} (+https://github.com/JhostinAleck/brightspace-mcp)`,
    metrics: input.metrics,
    retry: { maxAttempts: 3, initialMs: 250, maxMs: 5_000 },
    circuit: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    coalescer: new RequestCoalescer(),
    bulkhead: new Bulkhead({ maxConcurrent: 5 }),
    cache: input.httpCache,
    cacheTtlMs: 60_000,
    ...(input.transportPolicy ? { transportPolicy: input.transportPolicy } : {}),
    ...(input.pageRenderer ? { pageRenderer: input.pageRenderer } : {}),
  });
}
