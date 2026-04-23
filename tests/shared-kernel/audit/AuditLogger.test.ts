import { describe, expect, it } from 'vitest';

import { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import type { Logger } from '@/shared-kernel/logging/Logger.js';

function stubLogger(lines: string[]): Logger {
  return {
    debug: (): void => {},
    info: (): void => {},
    warn: (msg: string): void => {
      lines.push(msg);
    },
    error: (): void => {},
  };
}

describe('AuditLogger', () => {
  it('emits a WARN-level line with correlation id, tool name, and serialized args', () => {
    const lines: string[] = [];
    const logger = new AuditLogger({
      logger: stubLogger(lines),
      clock: () => 1700000000000,
    });

    logger.recordWriteAttempt({
      correlationId: 'cid-abc',
      tool: 'submit_assignment',
      args: { course_id: 'c1', file: { name: 'hw.pdf', size: 1024 } },
    });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!) as { tool: string; cid: string; args: unknown };
    expect(entry.tool).toBe('submit_assignment');
    expect(entry.cid).toBe('cid-abc');
    expect(entry.args).toEqual({ course_id: 'c1', file: { name: 'hw.pdf', size: 1024 } });
  });

  it('redacts secret-like fields in args', () => {
    const lines: string[] = [];
    const logger = new AuditLogger({
      logger: stubLogger(lines),
    });

    logger.recordWriteAttempt({
      correlationId: 'cid-xyz',
      tool: 'submit_assignment',
      args: { course_id: 'c1', api_token: 'secret123', password: 'hunter2' },
    });

    const entry = JSON.parse(lines[0]!) as { args: Record<string, string> };
    expect(entry.args.course_id).toBe('c1');
    expect(entry.args.api_token).toBe('[redacted]');
    expect(entry.args.password).toBe('[redacted]');
  });
});
