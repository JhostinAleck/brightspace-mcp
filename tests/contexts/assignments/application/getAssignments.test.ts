import { describe, it, expect } from 'vitest';
import { getAssignments } from '@/contexts/assignments/application/getAssignments';
import { Assignment } from '@/contexts/assignments/domain/Assignment';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';
import { DueDate } from '@/contexts/assignments/domain/DueDate';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const a = (id: number, name: string, due: Date | null) =>
  new Assignment({
    id: AssignmentId.of(id),
    courseOrgUnitId: 101,
    name,
    instructions: null,
    dueDate: due ? DueDate.at(due) : DueDate.unspecified(),
    submissions: [],
  });

describe('getAssignments', () => {
  it('returns assignments for the given course', async () => {
    const repo = new FakeAssignmentRepository(new Map([[101, [a(1, 'Essay', new Date('2026-05-01'))]]]));
    const result = await getAssignments({ repo, courseId: OrgUnitId.of(101) });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Essay');
  });

  it('filters past-due by default when includePast is false', async () => {
    const repo = new FakeAssignmentRepository(
      new Map([[101, [
        a(1, 'PastA', new Date('2025-01-01')),
        a(2, 'FutureB', new Date('2030-01-01')),
      ]]]),
    );
    const now = new Date('2026-01-01');
    const result = await getAssignments({ repo, courseId: OrgUnitId.of(101), now, includePast: false });
    expect(result.map((x) => x.name)).toEqual(['FutureB']);
  });

  it('includes past when includePast is true', async () => {
    const repo = new FakeAssignmentRepository(
      new Map([[101, [
        a(1, 'PastA', new Date('2025-01-01')),
        a(2, 'FutureB', new Date('2030-01-01')),
      ]]]),
    );
    const now = new Date('2026-01-01');
    const result = await getAssignments({ repo, courseId: OrgUnitId.of(101), now, includePast: true });
    expect(result).toHaveLength(2);
  });

  it('does not filter assignments without a due date', async () => {
    const repo = new FakeAssignmentRepository(new Map([[101, [a(1, 'NoDate', null)]]]));
    const now = new Date('2026-01-01');
    const result = await getAssignments({ repo, courseId: OrgUnitId.of(101), now, includePast: false });
    expect(result).toHaveLength(1);
  });
});
