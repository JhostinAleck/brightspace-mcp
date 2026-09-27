import { describe, it, expect } from 'vitest';
import { Assignment } from '@/contexts/assignments/domain/Assignment';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';
import { DueDate } from '@/contexts/assignments/domain/DueDate';
import { Submission } from '@/contexts/assignments/domain/Submission';
import { Rubric } from '@/contexts/assignments/domain/Rubric';
import { UserId } from '@/shared-kernel/types/UserId';

const base = {
  id: AssignmentId.of(1),
  courseOrgUnitId: 101,
  name: 'Lab',
  instructions: null,
  dueDate: DueDate.unspecified(),
  submissions: [] as Submission[],
};

describe('Assignment', () => {
  it('defaults optional metadata when absent', () => {
    const a = new Assignment(base);
    expect(a.kind).toBe('individual');
    expect(a.points).toBeNull();
    expect(a.startDate).toBeNull();
    expect(a.endDate).toBeNull();
    expect(a.linkAttachments).toEqual([]);
    expect(a.allowedFileTypes).toEqual({ mode: 'any' });
    expect(a.rubrics).toEqual([]);
    expect(a.submissionStatus).toBe('not_submitted');
  });

  it('submissionStatus is submitted when there is at least one submission', () => {
    const a = new Assignment({
      ...base,
      submissions: [new Submission({ submittedAt: new Date(), submittedBy: UserId.of(5), comments: null })],
    });
    expect(a.submissionStatus).toBe('submitted');
  });

  it('submissionStatus is unknown when D2L did not disclose submissions', () => {
    const a = new Assignment({ ...base, kind: 'group', submissionsKnown: false });
    expect(a.submissionStatus).toBe('unknown');
    expect(a.hasSubmission).toBe(false);
    expect(a.kind).toBe('group');
  });

  it('exposes points, availability window, links, file types and rubrics', () => {
    const rubric = new Rubric({ id: 9, name: 'R', description: null, groups: [], overallLevels: [] });
    const a = new Assignment({
      ...base,
      points: 5,
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-09-28T00:00:00Z'),
      linkAttachments: [{ name: 'Guide', url: 'https://example.edu' }],
      allowedFileTypes: { mode: 'custom', extensions: ['pdf'] },
      rubrics: [rubric],
    });
    expect(a.points).toBe(5);
    expect(a.startDate?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(a.endDate?.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(a.linkAttachments[0]?.name).toBe('Guide');
    expect(a.allowedFileTypes).toEqual({ mode: 'custom', extensions: ['pdf'] });
    expect(a.rubrics[0]?.name).toBe('R');
  });
});
