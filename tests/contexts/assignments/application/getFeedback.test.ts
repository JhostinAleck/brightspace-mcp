import { describe, it, expect } from 'vitest';
import { getFeedback } from '@/contexts/assignments/application/getFeedback';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { Feedback } from '@/contexts/assignments/domain/Feedback';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';

describe('getFeedback', () => {
  it('returns feedback when present', async () => {
    const fb = new Feedback({ score: 88, outOf: 100, text: 'nice', releasedAt: new Date() });
    const repo = new FakeAssignmentRepository(new Map(), new Map([[`${101}:${5001}`, fb]]));
    const out = await getFeedback({ repo, courseId: OrgUnitId.of(101), assignmentId: AssignmentId.of(5001) });
    expect(out?.score).toBe(88);
  });

  it('returns null when no feedback', async () => {
    const repo = new FakeAssignmentRepository(new Map());
    const out = await getFeedback({ repo, courseId: OrgUnitId.of(101), assignmentId: AssignmentId.of(9999) });
    expect(out).toBeNull();
  });
});
