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

const SECRET_KEYS = new Set(['api_token', 'token', 'password', 'secret', 'token_ref']);

function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (SECRET_KEYS.has(k)) {
      out[k] = '[redacted]';
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactArgs(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * AuditLogger records write-operation attempts as warn-level audit entries.
 *
 * Wraps the shared {@link Logger} so audit lines share the same output sink
 * as the rest of the application. The entire audit payload is serialized into
 * the log message string so downstream tooling can parse a single JSON object
 * per line without having to merge `message` and `context` fields.
 *
 * Secret-shaped fields (`api_token`, `token`, `password`, `secret`,
 * `token_ref`) are replaced with `[redacted]` recursively before serialization.
 */
export class AuditLogger {
  private readonly logger: Logger;
  private readonly clock: () => number;

  constructor(opts: AuditLoggerOptions) {
    this.logger = opts.logger;
    this.clock = opts.clock ?? ((): number => Date.now());
  }

  recordWriteAttempt(attempt: WriteAttempt): void {
    const entry = {
      ts: new Date(this.clock()).toISOString(),
      level: 'warn',
      event: 'write_attempt',
      cid: attempt.correlationId,
      tool: attempt.tool,
      args: redactArgs(attempt.args),
    };
    this.logger.warn(JSON.stringify(entry));
  }
}
