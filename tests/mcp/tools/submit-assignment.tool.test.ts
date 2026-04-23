import { describe, expect, it } from 'vitest';

import {
  handleSubmitAssignment,
  type SubmitAssignmentParams,
} from '@/mcp/tools/submit-assignment.tool.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { InMemoryIdempotencyStore } from '@/shared-kernel/idempotency/IdempotencyStore.js';
import { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import { WritesGate } from '@/shared-kernel/writes/WritesGate.js';

function makeDeps(
  gate: WritesGate,
  submitImpl: AssignmentRepository['submit'] = async () => ({
    submissionId: 'sub-1',
    submittedAt: new Date('2026-04-23T10:00:00Z'),
  }),
) {
  const repo: AssignmentRepository = {
    findByCourse: async () => [],
    findFeedback: async () => null,
    submit: submitImpl,
  };
  return {
    assignmentRepo: repo,
    idempotencyStore: new InMemoryIdempotencyStore(),
    auditLogger: new AuditLogger({
      logger: { warn: () => undefined } as never,
    }),
    writesGate: gate,
  };
}

const sampleParams: SubmitAssignmentParams = {
  course_id: '100',
  folder_id: '42',
  filename: 'hw.txt',
  content_base64: Buffer.from('hello').toString('base64'),
  idempotency_key: 'idem-test-12345',
};

describe('handleSubmitAssignment', () => {
  it('submits and returns submission id on first call', async () => {
    const deps = makeDeps(new WritesGate({ configEnabled: true, cliFlag: true }));
    const result = await handleSubmitAssignment(sampleParams, deps);
    expect(result.content[0]?.text).toContain('sub-1');
  });

  it('returns cached response on second call with same idempotency_key', async () => {
    let calls = 0;
    const deps = makeDeps(
      new WritesGate({ configEnabled: true, cliFlag: true }),
      async () => {
        calls++;
        return { submissionId: `sub-${calls}`, submittedAt: new Date() };
      },
    );
    const r1 = await handleSubmitAssignment(sampleParams, deps);
    const r2 = await handleSubmitAssignment(sampleParams, deps);
    expect(calls).toBe(1);  // only ONE real submit call
    expect(r1.content[0]?.text).toContain('sub-1');
    expect(r2.content[0]?.text).toContain('replay');
    expect(r2.content[0]?.text).toContain('sub-1');
  });

  it('returns dry-run preview when writesGate.isDryRun is true', async () => {
    let calls = 0;
    const deps = makeDeps(
      new WritesGate({ configEnabled: true, cliFlag: true, configDryRun: true }),
      async () => {
        calls++;
        return { submissionId: 'sub-x', submittedAt: new Date() };
      },
    );
    const result = await handleSubmitAssignment(sampleParams, deps);
    expect(calls).toBe(0);  // NO real call
    expect(result.content[0]?.text).toContain('[dry-run]');
  });
});
