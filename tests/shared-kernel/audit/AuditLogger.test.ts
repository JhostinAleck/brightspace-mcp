import { describe, expect, it } from 'vitest';

import { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import type { Logger } from '@/shared-kernel/logging/Logger.js';

interface CapturedWarn {
  msg: string;
  ctx: Record<string, unknown> | undefined;
}

function stubLogger(captures: CapturedWarn[]): Logger {
  return {
    debug: (): void => {},
    info: (): void => {},
    warn: (msg: string, ctx?: Record<string, unknown>): void => {
      captures.push({ msg, ctx });
    },
    error: (): void => {},
  };
}

describe('AuditLogger', () => {
  it('emits a WARN-level line with correlation id, tool name, and serialized args', () => {
    const captures: CapturedWarn[] = [];
    const logger = new AuditLogger({
      logger: stubLogger(captures),
      clock: () => 1700000000000,
    });

    logger.recordWriteAttempt({
      correlationId: 'cid-abc',
      tool: 'submit_assignment',
      args: { course_id: 101, file: { name: 'hw.pdf', size: 1024 } },
    });

    expect(captures).toHaveLength(1);
    const entry = captures[0]!;
    expect(entry.msg).toBe('audit.write_attempt');
    expect(entry.ctx).toMatchObject({
      event: 'write_attempt',
      cid: 'cid-abc',
      tool: 'submit_assignment',
      args: { course_id: 101, file: { name: 'hw.pdf', size: 1024 } },
    });
  });

  it('redacts secret-like fields in args', () => {
    const captures: CapturedWarn[] = [];
    const logger = new AuditLogger({ logger: stubLogger(captures) });

    logger.recordWriteAttempt({
      correlationId: 'cid-xyz',
      tool: 'submit_assignment',
      args: { course_id: 101, api_token: 'secret123', password: 'hunter2' },
    });

    const args = captures[0]!.ctx?.args as Record<string, unknown>;
    expect(args.course_id).toBe(101);
    expect(args.api_token).toBe('[redacted]');
    expect(args.password).toBe('[redacted]');
  });

  it('redacts secret-like fields inside arrays in args', () => {
    const captures: CapturedWarn[] = [];
    const logger = new AuditLogger({ logger: stubLogger(captures) });

    logger.recordWriteAttempt({
      correlationId: 'cid-1',
      tool: 'submit_assignment',
      args: { tokens: [{ api_token: 'supersecret', name: 'alice' }] },
    });

    const args = captures[0]!.ctx?.args as { tokens: Array<Record<string, string>> };
    expect(args.tokens[0]!.api_token).toBe('[redacted]');
    expect(args.tokens[0]!.name).toBe('alice');
  });
});
