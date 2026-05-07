import { describe, expect, it } from 'vitest';

import { submitAssignment } from '@/contexts/assignments/application/submitAssignment.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

function makeFakeRepo(
  submissions: Array<{ courseId: number; folderId: string; filename: string; bytes: number }> = [],
): AssignmentRepository {
  return {
    findByCourse: async () => [],
    findFeedback: async () => null,
    findFiles: async () => ({ assignmentId: '0', assignmentName: '', instructions: '', files: [], fileContents: {} }),
    submit: async (input) => {
      submissions.push({
        courseId: OrgUnitId.toNumber(input.courseId),
        folderId: input.folderId,
        filename: input.draft.filename,
        bytes: input.draft.content.byteLength,
      });
      return { submissionId: 'sub-123', submittedAt: new Date('2026-04-23') };
    },
  };
}

describe('submitAssignment', () => {
  it('invokes repository submit with the draft', async () => {
    const submissions: Array<{ courseId: number; folderId: string; filename: string; bytes: number }> = [];
    const repo = makeFakeRepo(submissions);
    const result = await submitAssignment({
      repo,
      courseId: '101',
      folderId: 'f1',
      filename: 'hw.pdf',
      contentBase64: Buffer.from('hello').toString('base64'),
    });
    expect(result.submissionId).toBe('sub-123');
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({ courseId: 101, folderId: 'f1', filename: 'hw.pdf', bytes: 5 });
  });

  it('rejects filenames that look like path traversal', async () => {
    const repo = makeFakeRepo();
    await expect(
      submitAssignment({
        repo,
        courseId: '101',
        folderId: 'f1',
        filename: '../../../etc/passwd',
        contentBase64: Buffer.from('x').toString('base64'),
      }),
    ).rejects.toThrow(/filename/i);
  });

  it('rejects non-numeric courseId strings', async () => {
    const repo = makeFakeRepo();
    await expect(
      submitAssignment({
        repo,
        courseId: 'c1',
        folderId: 'f1',
        filename: 'hw.pdf',
        contentBase64: Buffer.from('x').toString('base64'),
      }),
    ).rejects.toThrow(/Invalid OrgUnitId/);
  });

  it('accepts a pre-decoded content buffer (preferred over base64)', async () => {
    const submissions: Array<{ courseId: number; folderId: string; filename: string; bytes: number }> = [];
    const repo = makeFakeRepo(submissions);
    await submitAssignment({
      repo,
      courseId: '101',
      folderId: 'f1',
      filename: 'hw.pdf',
      content: Buffer.from('hi'),
    });
    expect(submissions[0]?.bytes).toBe(2);
  });
});
