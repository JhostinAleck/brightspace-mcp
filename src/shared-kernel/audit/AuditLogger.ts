import type { Logger } from '@/shared-kernel/logging/Logger.js';

export interface AuditLoggerOptions {
  logger: Logger;
  clock?: () => number;
}

export interface WriteAttempt {
  correlationId: string;
  tool: string;
  args: Record<string, unknown>;
}

const SECRET_KEYS = new Set([
  'api_token',
  'token',
  'access_token',
  'refresh_token',
  'bearer',
  'password',
  'passphrase',
  'secret',
  'token_ref',
  'secret_ref',
  'client_secret',
  'cookie',
  'authorization',
]);

function redactValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(redactValue);
  return redactArgs(v as Record<string, unknown>);
}

function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = SECRET_KEYS.has(k.toLowerCase()) ? '[redacted]' : redactValue(v);
  }
  return out;
}

/**
 * AuditLogger records write-operation attempts as warn-level audit entries.
 *
 * Wraps the shared {@link Logger} so audit lines share the same output sink
 * as the rest of the application. The audit fields are passed as the
 * structured-logger `context` argument so the resulting JSON line has a
 * single ts and a flat shape — downstream tooling can parse one JSON object
 * per line without having to unwrap a nested message string.
 *
 * Secret-shaped fields (`api_token`, `token`, `password`, `secret`,
 * `token_ref`, `client_secret`, `access_token`, `refresh_token`, `cookie`,
 * `authorization`, etc.) are replaced with `[redacted]` recursively before
 * serialization. The structured-logger's regex redactor runs additionally as
 * defense in depth.
 *
 * Audit happens AFTER the idempotency check at call sites so replays do not
 * inflate the audit log. The site is responsible for ordering.
 */
export class AuditLogger {
  private readonly logger: Logger;
  private readonly clock: () => number;

  constructor(opts: AuditLoggerOptions) {
    this.logger = opts.logger;
    this.clock = opts.clock ?? ((): number => Date.now());
  }

  recordWriteAttempt(attempt: WriteAttempt): void {
    this.logger.warn('audit.write_attempt', {
      audit_ts: new Date(this.clock()).toISOString(),
      event: 'write_attempt',
      cid: attempt.correlationId,
      tool: attempt.tool,
      args: redactArgs(attempt.args),
    });
  }
}
