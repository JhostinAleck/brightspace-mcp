import { createHash } from 'node:crypto';
import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import type { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import { HttpResponseCache } from './cache/HttpResponseCache.js';
import { AuthExpiredError, D2lApiError, NetworkError, RateLimitedError, classifyD2lError } from './errors.js';
import type { Bulkhead } from './resilience/Bulkhead.js';
import { CircuitBreaker, CircuitOpenError } from './resilience/CircuitBreaker.js';
import type { RequestCoalescer } from './resilience/RequestCoalescer.js';
import { RetryPolicy, type RetryDecision } from './resilience/RetryPolicy.js';
import { TransportPolicy } from './transport/TransportPolicy.js';
import type { PlaywrightPageRenderer } from './PlaywrightPageRenderer.js';

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
  /**
   * Optional callback invoked when a request returns an `AuthExpiredError`
   * (HTTP 401 or 403 with xsrf body). Implementations should force the auth
   * strategy to re-authenticate and return a fresh token. The client retries
   * the failed request exactly once with the new token. If `onAuthFailure`
   * is unset, the original error bubbles unchanged.
   *
   * Concurrent failures are debounced — only the first caller actually
   * triggers re-auth; the rest await the same promise.
   */
  onAuthFailure?: () => Promise<AccessToken>;
  timeoutMs?: number;
  userAgent?: string;
  transportPolicy?: TransportPolicy;
  retry?: RetryConfig;
  circuit?: CircuitConfig;
  coalescer?: RequestCoalescer;
  bulkhead?: Bulkhead;
  cache?: HttpResponseCache;
  cacheTtlMs?: number;
  pageRenderer?: PlaywrightPageRenderer;
  metrics?: MetricsRegistry;
}

const DEFAULT_UA = 'brightspace-mcp/dev (+https://github.com/JhostinAleck/brightspace-mcp)';

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;
  const asInt = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asInt)) {
    if (asInt < 0) return null;
    return asInt * 1000;
  }
  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

function authFingerprintHash(token: AccessToken): string {
  // SHA-256 first 16 hex chars: 64-bit truncation. Birthday collision risk
  // negligible for any realistic cache size (<10K entries).
  // Crucially: hashing happens at the boundary so the raw secret never lives
  // inside the cacheKey object — the only consumer that needs the secret is
  // the actual fetch call, which receives the token directly.
  return createHash('sha256').update(token.reveal()).digest('hex').slice(0, 16);
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
  private readonly metrics?: MetricsRegistry;
  // D2L requires an X-Csrf-Token header on write requests. The value is the
  // `referrerToken` field returned by /d2l/lp/auth/xsrf-tokens. Cached for the
  // lifetime of the client (the token is tied to the session). Invalidated by
  // resetXsrfToken() if a write fails with a token-related 403.
  private xsrfToken: string | null = null;
  // Debouncer for concurrent re-auth attempts. The first caller to hit an
  // AuthExpiredError populates this; all concurrent failures await the same
  // promise and retry with the same fresh token. Cleared once resolved.
  private authRefreshInFlight: Promise<AccessToken> | null = null;

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
      this.breaker = new CircuitBreaker({
        ...opts.circuit,
        ...(opts.metrics ? { onStateChange: (s) => opts.metrics!.inc(`circuit.${s}`) } : {}),
      });
    }
    if (opts.coalescer) this.coalescer = opts.coalescer;
    if (opts.bulkhead) this.bulkhead = opts.bulkhead;
    this.cacheTtlMs = opts.cacheTtlMs ?? 0;
    if (opts.cache) {
      this.cache = opts.cache;
    } else if (this.cacheTtlMs > 0) {
      this.cache = new HttpResponseCache(new InMemoryCache());
    }
    if (opts.metrics) this.metrics = opts.metrics;
  }

  async get<T>(path: string): Promise<T> {
    return this.withAuthRefresh(() => this.getOnceCached<T>(path));
  }

  private async getOnceCached<T>(path: string): Promise<T> {
    const token = await this.opts.getToken();
    const fingerprint = authFingerprintHash(token);
    const cacheKey = { method: 'GET', path, authFingerprint: fingerprint };

    if (this.cache && this.cacheTtlMs > 0) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached !== null) {
        this.metrics?.inc('http.cache.hit');
        return cached;
      }
      this.metrics?.inc('http.cache.miss');
    }

    const key = `GET ${path} ${fingerprint}`;
    // The cache write lives inside the coalesced fn so it runs ONCE per
    // upstream fetch — concurrent callers will all await the same promise
    // and only the originator pays the cache.set cost.
    const doFetch = async (): Promise<T> => {
      const result = await this.withMiddlewares(() => this.fetchOnce<T>(path, token));
      if (this.cache && this.cacheTtlMs > 0) {
        await this.cache.set(cacheKey, result, this.cacheTtlMs);
      }
      return result;
    };
    return this.coalescer ? this.coalescer.run(key, doFetch) : doFetch();
  }

  async getHtml(path: string): Promise<string> {
    const token = await this.opts.getToken();
    return this.withMiddlewares(() => this.fetchText(path, token));
  }

  async getRaw(path: string): Promise<Buffer> {
    const token = await this.opts.getToken();
    return this.withMiddlewares(() => this.fetchBinary(path, token));
  }

  async getRenderedHtml(path: string): Promise<string> {
    if (this.opts.pageRenderer) return this.opts.pageRenderer.getRenderedHtml(path);
    return this.getHtml(path);
  }

  async getRenderedText(path: string): Promise<string> {
    if (this.opts.pageRenderer) return this.opts.pageRenderer.getRenderedText(path);
    const html = await this.getHtml(path);
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
  }

  private observeStatus(status: number): void {
    this.metrics?.inc(`http.status.${status}`);
  }

  private async fetchText(path: string, token: AccessToken): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    this.transport.validate(url);
    const { name, value } = token.toAuthHeader();
    let response: Response;
    const start = this.metrics ? performance.now() : 0;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { [name]: value, 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.metrics?.inc('http.network_error');
      throw new NetworkError(`GET ${path} failed`, err instanceof Error ? err : undefined);
    } finally {
      if (this.metrics) this.metrics.observe('http.duration_ms', performance.now() - start);
    }
    this.observeStatus(response.status);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw classifyD2lError(new D2lApiError(response.status, path, body));
    }
    return response.text();
  }

  private async fetchBinary(path: string, token: AccessToken): Promise<Buffer> {
    const url = `${this.baseUrl}${path}`;
    this.transport.validate(url);
    const { name, value } = token.toAuthHeader();
    let response: Response;
    const start = this.metrics ? performance.now() : 0;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { [name]: value, 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.metrics?.inc('http.network_error');
      throw new NetworkError(`GET ${path} failed`, err instanceof Error ? err : undefined);
    } finally {
      if (this.metrics) this.metrics.observe('http.duration_ms', performance.now() - start);
    }
    this.observeStatus(response.status);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw classifyD2lError(new D2lApiError(response.status, path, body));
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async postMultipart<T>(path: string, formData: FormData): Promise<T> {
    return this.withAuthRefresh(async () => {
      const token = await this.opts.getToken();
      return this.withMiddlewares(() => this.postMultipartOnce<T>(path, formData, token));
    });
  }

  /**
   * POST a manually-constructed body with a caller-provided Content-Type. Used
   * for D2L endpoints that require `multipart/mixed` (per Valence docs) rather
   * than the standard `multipart/form-data` that FormData emits — most notably
   * `/dropbox/folders/{id}/submissions/mysubmissions/`.
   */
  async postRawMultipart<T>(path: string, body: Buffer, contentType: string): Promise<T> {
    return this.withAuthRefresh(async () => {
      const token = await this.opts.getToken();
      return this.withMiddlewares(() => this.postRawMultipartOnce<T>(path, body, contentType, token));
    });
  }

  private async postRawMultipartOnce<T>(
    path: string,
    body: Buffer,
    contentType: string,
    token: AccessToken,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.transport.validate(url);
    const { name, value } = token.toAuthHeader();
    const xsrf = await this.getXsrfToken(token);
    const headers: Record<string, string> = {
      [name]: value,
      'User-Agent': this.userAgent,
      'Content-Type': contentType,
    };
    if (xsrf) headers['X-Csrf-Token'] = xsrf;

    let response: Response;
    const start = this.metrics ? performance.now() : 0;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        // Buffer extends Uint8Array but TS lib.dom.fetch types don't accept Buffer directly.
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.metrics?.inc('http.network_error');
      throw new NetworkError(`POST ${path} failed`, err instanceof Error ? err : undefined);
    } finally {
      if (this.metrics) this.metrics.observe('http.duration_ms', performance.now() - start);
    }
    this.observeStatus(response.status);
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw new RateLimitedError(path, retryAfterMs);
    }
    if (response.status === 403 && xsrf) this.resetXsrfToken();
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw classifyD2lError(new D2lApiError(response.status, path, responseBody));
    }
    const text = await response.text();
    if (text.length === 0) return {} as T;
    return JSON.parse(text) as T;
  }

  /**
   * Lazy-fetch and cache the D2L XSRF token. Returns null when the endpoint is
   * unavailable (e.g. api_token strategy that already authenticates via Bearer
   * doesn't need it) so callers can decide whether to error or proceed.
   */
  private async getXsrfToken(authToken: AccessToken): Promise<string | null> {
    if (this.xsrfToken) return this.xsrfToken;
    const url = `${this.baseUrl}/d2l/lp/auth/xsrf-tokens`;
    this.transport.validate(url);
    const { name, value } = authToken.toAuthHeader();
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { [name]: value, 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { referrerToken?: string };
      if (json.referrerToken && typeof json.referrerToken === 'string') {
        this.xsrfToken = json.referrerToken;
        return this.xsrfToken;
      }
    } catch {
      // Best-effort: non-D2L-web auth (api_token Bearer) won't expose this endpoint.
    }
    return null;
  }

  /** Force the next write request to refetch the XSRF token. */
  resetXsrfToken(): void {
    this.xsrfToken = null;
  }

  /**
   * Wraps an HTTP operation so that on AuthExpiredError, the registered
   * `onAuthFailure` callback runs (debounced across concurrent callers) and
   * the operation is retried exactly once. XSRF and any session caches are
   * also cleared so the retry uses fresh credentials end-to-end.
   *
   * Returns the original error if no `onAuthFailure` is configured.
   */
  private async withAuthRefresh<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (!(err instanceof AuthExpiredError) || !this.opts.onAuthFailure) throw err;
      this.metrics?.inc('http.auth.refresh');
      // Debounce: first concurrent caller spawns the refresh; the rest await it.
      if (!this.authRefreshInFlight) {
        this.authRefreshInFlight = this.opts.onAuthFailure().finally(() => {
          this.authRefreshInFlight = null;
        });
      }
      try {
        await this.authRefreshInFlight;
      } catch {
        // If refresh itself failed, surface the original auth error so the
        // caller's hint chain stays clean.
        throw err;
      }
      this.resetXsrfToken();
      return op();
    }
  }

  private async postMultipartOnce<T>(
    path: string,
    formData: FormData,
    token: AccessToken,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.transport.validate(url);
    const { name, value } = token.toAuthHeader();
    const xsrf = await this.getXsrfToken(token);
    const headers: Record<string, string> = { [name]: value, 'User-Agent': this.userAgent };
    if (xsrf) headers['X-Csrf-Token'] = xsrf;

    let response: Response;
    const start = this.metrics ? performance.now() : 0;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.metrics?.inc('http.network_error');
      throw new NetworkError(`POST ${path} failed`, err instanceof Error ? err : undefined);
    } finally {
      if (this.metrics) this.metrics.observe('http.duration_ms', performance.now() - start);
    }
    this.observeStatus(response.status);
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw new RateLimitedError(path, retryAfterMs);
    }
    // Stale XSRF → drop cache so the next attempt refetches.
    if (response.status === 403 && xsrf) this.resetXsrfToken();
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw classifyD2lError(new D2lApiError(response.status, path, body));
    }
    return (await response.json()) as T;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.withAuthRefresh(async () => {
      const token = await this.opts.getToken();
      return this.withMiddlewares(() => this.postJsonOnce<T>(path, body, token));
    });
  }

  private async postJsonOnce<T>(path: string, body: unknown, token: AccessToken): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.transport.validate(url);
    const { name, value } = token.toAuthHeader();
    const xsrf = await this.getXsrfToken(token);
    const headers: Record<string, string> = {
      [name]: value,
      'User-Agent': this.userAgent,
      'Content-Type': 'application/json',
    };
    if (xsrf) headers['X-Csrf-Token'] = xsrf;

    let response: Response;
    const start = this.metrics ? performance.now() : 0;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.metrics?.inc('http.network_error');
      throw new NetworkError(`POST ${path} failed`, err instanceof Error ? err : undefined);
    } finally {
      if (this.metrics) this.metrics.observe('http.duration_ms', performance.now() - start);
    }
    this.observeStatus(response.status);
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw new RateLimitedError(path, retryAfterMs);
    }
    if (response.status === 403 && xsrf) this.resetXsrfToken();
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw classifyD2lError(new D2lApiError(response.status, path, responseBody));
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
    const start = this.metrics ? performance.now() : 0;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { [name]: value, 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.metrics?.inc('http.network_error');
      throw new NetworkError(`GET ${path} failed`, err instanceof Error ? err : undefined);
    } finally {
      if (this.metrics) this.metrics.observe('http.duration_ms', performance.now() - start);
    }

    this.observeStatus(response.status);
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw new RateLimitedError(path, retryAfterMs);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw classifyD2lError(new D2lApiError(response.status, path, body));
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
