import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  handleSubmitAssignment,
  submitAssignmentSchema,
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

describe('submitAssignmentSchema — file_path', () => {
  let tmpDir: string;
  let goodPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'submit-test-'));
    goodPath = join(tmpDir, 'hw.zip');
    writeFileSync(goodPath, 'binary file content goes here');
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts file_path without filename (defaults to basename)', () => {
    const result = submitAssignmentSchema.safeParse({
      course_id: '1', folder_id: '2', file_path: goodPath, idempotency_key: 'k'.repeat(10),
    });
    expect(result.success).toBe(true);
  });

  it('rejects when both file_path and content_base64 provided', () => {
    const result = submitAssignmentSchema.safeParse({
      course_id: '1', folder_id: '2',
      file_path: goodPath,
      content_base64: 'eA==',
      idempotency_key: 'k'.repeat(10),
    });
    expect(result.success).toBe(false);
  });

  it('rejects when neither file_path nor content_base64 provided', () => {
    const result = submitAssignmentSchema.safeParse({
      course_id: '1', folder_id: '2', idempotency_key: 'k'.repeat(10),
    });
    expect(result.success).toBe(false);
  });

  it('rejects content_base64 without filename', () => {
    const result = submitAssignmentSchema.safeParse({
      course_id: '1', folder_id: '2',
      content_base64: Buffer.from('x').toString('base64'),
      idempotency_key: 'k'.repeat(10),
    });
    expect(result.success).toBe(false);
  });
});

describe('handleSubmitAssignment — file_path branch', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'submit-handler-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads the file from disk and submits', async () => {
    const filePath = join(tmpDir, 'lab.zip');
    writeFileSync(filePath, 'zip contents 12345');
    let captured: { filename: string; bytes: number } | null = null;
    const deps = makeDeps(
      new WritesGate({ configEnabled: true, cliFlag: true }),
      async (input) => {
        captured = { filename: input.draft.filename, bytes: input.draft.content.byteLength };
        return { submissionId: 'sub-fp-1', submittedAt: new Date() };
      },
    );
    const result = await handleSubmitAssignment({
      course_id: '1', folder_id: '2',
      file_path: filePath,
      idempotency_key: 'fp-key-12345',
    } as SubmitAssignmentParams, deps);
    expect(result.content[0]?.text).toContain('sub-fp-1');
    expect(result.content[0]?.text).toContain('lab.zip');
    expect(captured).toEqual({ filename: 'lab.zip', bytes: 18 });
  });

  it('respects an explicit filename override even with file_path', async () => {
    const filePath = join(tmpDir, 'original.zip');
    writeFileSync(filePath, 'x');
    let captured: { filename: string } | null = null;
    const deps = makeDeps(
      new WritesGate({ configEnabled: true, cliFlag: true }),
      async (input) => {
        captured = { filename: input.draft.filename };
        return { submissionId: 's', submittedAt: new Date() };
      },
    );
    await handleSubmitAssignment({
      course_id: '1', folder_id: '2',
      file_path: filePath, filename: 'renamed.zip',
      idempotency_key: 'rename-key-12345',
    } as SubmitAssignmentParams, deps);
    expect(captured?.filename).toBe('renamed.zip');
  });

  it('throws on missing file_path', async () => {
    const deps = makeDeps(new WritesGate({ configEnabled: true, cliFlag: true }));
    await expect(
      handleSubmitAssignment({
        course_id: '1', folder_id: '2',
        file_path: '/no/such/path/at/all.zip',
        idempotency_key: 'missing-key-12345',
      } as SubmitAssignmentParams, deps),
    ).rejects.toThrow(/could not be read/);
  });

  it('throws on empty file_path', async () => {
    const filePath = join(tmpDir, 'empty.zip');
    writeFileSync(filePath, '');
    const deps = makeDeps(new WritesGate({ configEnabled: true, cliFlag: true }));
    await expect(
      handleSubmitAssignment({
        course_id: '1', folder_id: '2',
        file_path: filePath,
        idempotency_key: 'empty-key-12345',
      } as SubmitAssignmentParams, deps),
    ).rejects.toThrow(/empty/);
  });
});
