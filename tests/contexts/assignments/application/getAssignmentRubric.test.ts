import { describe, it, expect } from 'vitest';
import { getAssignmentRubric } from '@/contexts/assignments/application/getAssignmentRubric';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { Rubric } from '@/contexts/assignments/domain/Rubric';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';

describe('getAssignmentRubric', () => {
  it('delegates to the repository', async () => {
    const rubric = new Rubric({ id: 1, name: 'R', description: null, groups: [], overallLevels: [] });
    const repo = new FakeAssignmentRepository(new Map(), new Map(), new Map([['101:5', [rubric]]]));
    const out = await getAssignmentRubric({ repo, courseId: OrgUnitId.of(101), assignmentId: AssignmentId.of(5) });
    expect(out.map((r) => r.name)).toEqual(['R']);
  });
});
