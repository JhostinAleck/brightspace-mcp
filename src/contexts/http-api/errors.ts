import { InfrastructureError } from '@/shared-kernel/errors/InfrastructureError.js';

export class D2lApiError extends InfrastructureError {
  readonly code: string;
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
    cause?: Error,
  ) {
    super(`D2L API ${status} on ${path}: ${body.slice(0, 200)}`, cause);
    this.code = `HTTP_${status}`;
  }
}

export class NetworkError extends InfrastructureError {
  readonly code = 'NETWORK_ERROR';
  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export class RateLimitedError extends InfrastructureError {
  readonly code = 'HTTP_429';
  constructor(
    readonly path: string,
    readonly retryAfterMs: number | null,
    cause?: Error,
  ) {
    super(`Rate limited on ${path} (Retry-After=${retryAfterMs === null ? 'unset' : `${retryAfterMs}ms`})`, cause);
  }
}

/**
 * Auth-failure classification. Subclass of D2lApiError so existing handlers
 * keep working, but adds a stable code (`AUTH_EXPIRED`) and a friendly hint
 * MCP tools can surface to the user without parsing HTTP status.
 */
export class AuthExpiredError extends D2lApiError {
  override readonly code = 'AUTH_EXPIRED';
  readonly hint =
    'Your Brightspace session expired. Run `brightspace-mcp record-auth` to capture fresh cookies, ' +
    'or re-run `brightspace-mcp auth` for credential-based strategies.';
  constructor(status: number, path: string, body: string, cause?: Error) {
    super(status, path, body, cause);
  }
}

/**
 * The Brightspace tenant rejected a write that was authenticated correctly.
 * Most often: tenant policy disables student-side writes via the Valence API.
 * The MCP `submit_assignment` tool falls back to a Playwright UI flow when
 * this fires; surfacing the typed error helps callers (and tests) tell apart
 * "your auth is bad" from "tenant blocked us".
 */
export class WritesDisabledByTenantError extends D2lApiError {
  override readonly code = 'WRITES_DISABLED_BY_TENANT';
  readonly hint =
    'This Brightspace tenant blocks student-side write API. The MCP server falls back to ' +
    'a Playwright UI flow automatically; if you see this error directly, the UI fallback ' +
    'is also unavailable (no Playwright? wrong selectors?). See docs/troubleshooting.md.';
  constructor(status: number, path: string, body: string, cause?: Error) {
    super(status, path, body, cause);
  }
}

/**
 * Heuristic classifier mapping a raw D2lApiError to a more specific subtype.
 * Returns the original error if no match — never throws. Pure function.
 */
export function classifyD2lError(err: D2lApiError): D2lApiError {
  // 401 is unambiguously expired/missing auth.
  if (err.status === 401) return new AuthExpiredError(err.status, err.path, err.body);
  // 403 has two flavours: stale XSRF and tenant policy. Heuristic: a 403 on a
  // writes path (POST to /dropbox/, /forums/posts/, /news/) with a body that
  // does NOT mention "csrf"/"xsrf" is most likely tenant policy.
  if (err.status === 403) {
    const lower = err.body.toLowerCase();
    if (lower.includes('xsrf') || lower.includes('csrf')) {
      // The HTTP client already self-heals XSRF on 403; if we still see one
      // it bubbled up — treat as auth issue.
      return new AuthExpiredError(err.status, err.path, err.body);
    }
    if (/\/dropbox\/|\/forums\/.+\/posts\/|\/news\//.test(err.path)) {
      return new WritesDisabledByTenantError(err.status, err.path, err.body);
    }
  }
  return err;
}
