import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import { HttpResponseCache } from './cache/HttpResponseCache.js';
import { D2lApiError, NetworkError, RateLimitedError } from './errors.js';
import type { Bulkhead } from './resilience/Bulkhead.js';
import { CircuitBreaker, CircuitOpenError } from './resilience/CircuitBreaker.js';
import type { RequestCoalescer } from './resilience/RequestCoalescer.js';
import { RetryPolicy, type RetryDecision } from './resilience/RetryPolicy.js';
import { TransportPolicy } from './transport/TransportPolicy.js';

export interface RetryConfig {
  maxAttempts: number;
  initialMs: number;
  maxMs: number;
}

export interface CircuitConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export interface D2lApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<AccessToken>;
  timeoutMs?: number;
  userAgent?: string;
  transportPolicy?: TransportPolicy;
  retry?: RetryConfig;
  circuit?: CircuitConfig;
  coalescer?: RequestCoalescer;
  bulkhead?: Bulkhead;
  cache?: HttpResponseCache;
  cacheTtlMs?: number;
}

const DEFAULT_UA =
  'brightspace-mcp/0.2.0 (+https://github.com/JhostinAleck/brightspace-mcp)';

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const asInt = Number.parseInt(header, 10);
  if (!Number.isNaN(asInt)) return asInt * 1000;
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

export class D2lApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly transport: TransportPolicy;
  private readonly retry?: RetryPolicy;
  private readonly breaker?: CircuitBreaker;
  private readonly coalescer?: RequestCoalescer;
  private readonly bulkhead?: Bulkhead;
  private readonly cache?: HttpResponseCache;
  private readonly cacheTtlMs: number;

  constructor(private readonly opts: D2lApiClientOptions) {
    this.transport = opts.transportPolicy ?? TransportPolicy.strict();
    this.transport.validate(opts.baseUrl);
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
    if (opts.retry) {
      this.retry = new RetryPolicy({
        maxAttempts: opts.retry.maxAttempts,
        initialMs: opts.retry.initialMs,
        maxMs: opts.retry.maxMs,
        classifier: (err) => this.classify(err),
      });
    }
    if (opts.circuit) {
      this.breaker = new CircuitBreaker(opts.circuit);
    }
    if (opts.coalescer) this.coalescer = opts.coalescer;
    if (opts.bulkhead) this.bulkhead = opts.bulkhead;
    this.cacheTtlMs = opts.cacheTtlMs ?? 0;
    if (opts.cache) {
      this.cache = opts.cache;
    } else if (this.cacheTtlMs > 0) {
      this.cache = new HttpResponseCache(new InMemoryCache());
    }
  }

  async get<T>(path: string): Promise<T> {
    const token = await this.opts.getToken();
    const authFingerprint = token.reveal();
    const cacheKey = { method: 'GET', path, authFingerprint };

    if (this.cache && this.cacheTtlMs > 0) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached !== null) return cached;
    }

    const key = `GET ${path} ${authFingerprint}`;
    const doFetch = (): Promise<T> =>
      this.withMiddlewares(() => this.fetchOnce<T>(path, token));
    const coalesced = this.coalescer ? this.coalescer.run(key, doFetch) : doFetch();
    const result = await coalesced;

    if (this.cache && this.cacheTtlMs > 0) {
      await this.cache.set(cacheKey, result, this.cacheTtlMs);
    }
    return result;
  }

  async postMultipart<T>(path: string, formData: FormData): Promise<T> {
    const token = await this.opts.getToken();
    return this.withMiddlewares(() => this.postMultipartOnce<T>(path, formData, token));
  }

  private async postMultipartOnce<T>(
    path: string,
    formData: FormData,
    token: AccessToken,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.transport.validate(url);
    const { name, value } = token.toAuthHeader();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { [name]: value, 'User-Agent': this.userAgent },
        body: formData,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new NetworkError(`POST ${path} failed`, err instanceof Error ? err : undefined);
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw new RateLimitedError(path, retryAfterMs);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new D2lApiError(response.status, path, body);
    }
    return (await response.json()) as T;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const token = await this.opts.getToken();
    return this.withMiddlewares(() => this.postJsonOnce<T>(path, body, token));
  }

  private async postJsonOnce<T>(path: string, body: unknown, token: AccessToken): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.transport.validate(url);
    const { name, value } = token.toAuthHeader();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          [name]: value,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new NetworkError(`POST ${path} failed`, err instanceof Error ? err : undefined);
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw new RateLimitedError(path, retryAfterMs);
    }
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new D2lApiError(response.status, path, responseBody);
    }

    const text = await response.text();
    if (text.length === 0) return {} as T;
    return JSON.parse(text) as T;
  }

  private async withMiddlewares<T>(op: () => Promise<T>): Promise<T> {
    const bulkhead = this.bulkhead;
    const retry = this.retry;
    const breaker = this.breaker;
    const bulked = bulkhead ? (): Promise<T> => bulkhead.run(op) : op;
    const retried = retry ? (): Promise<T> => retry.run(bulked) : bulked;
    const guarded = breaker ? (): Promise<T> => breaker.run(retried) : retried;
    return guarded();
  }

  private async fetchOnce<T>(path: string, token: AccessToken): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.transport.validate(url);
    const { name, value } = token.toAuthHeader();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { [name]: value, 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new NetworkError(`GET ${path} failed`, err instanceof Error ? err : undefined);
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw new RateLimitedError(path, retryAfterMs);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new D2lApiError(response.status, path, body);
    }
    return (await response.json()) as T;
  }

  private classify(err: unknown): RetryDecision {
    if (err instanceof RateLimitedError) {
      return {
        retry: true,
        ...(err.retryAfterMs !== null ? { retryAfterMs: err.retryAfterMs } : {}),
      };
    }
    if (err instanceof NetworkError) return { retry: true };
    if (err instanceof D2lApiError) {
      if (err.status >= 500 && err.status < 600) return { retry: true };
      return { retry: false };
    }
    if (err instanceof CircuitOpenError) return { retry: false };
    return { retry: false };
  }
}
