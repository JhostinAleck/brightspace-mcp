import { describe, it, expect } from 'vitest';
import { getUpcomingDueDates } from '@/contexts/assignments/application/getUpcomingDueDates';
import { Assignment } from '@/contexts/assignments/domain/Assignment';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';
import { DueDate } from '@/contexts/assignments/domain/DueDate';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const a = (id: number, courseOrgUnit: number, name: string, due: Date | null) =>
  new Assignment({
    id: AssignmentId.of(id),
    courseOrgUnitId: courseOrgUnit,
    name,
    instructions: null,
    dueDate: due ? DueDate.at(due) : DueDate.unspecified(),
    submissions: [],
  });

describe('getUpcomingDueDates', () => {
  it('aggregates across courses and sorts by due date ascending', async () => {
    const repo = new FakeAssignmentRepository(new Map([
      [101, [a(1, 101, 'ECE Essay', new Date('2026-03-01'))]],
      [202, [a(2, 202, 'MA Test', new Date('2026-02-15'))]],
    ]));
    const result = await getUpcomingDueDates({
      repo,
      courseIds: [OrgUnitId.of(101), OrgUnitId.of(202)],
      from: new Date('2026-01-01'),
      to: new Date('2026-06-01'),
    });
    expect(result.map((x) => x.name)).toEqual(['MA Test', 'ECE Essay']);
  });

  it('excludes assignments outside the window', async () => {
    const repo = new FakeAssignmentRepository(new Map([
      [101, [
        a(1, 101, 'TooEarly', new Date('2025-01-01')),
        a(2, 101, 'InWindow', new Date('2026-03-01')),
        a(3, 101, 'TooLate', new Date('2030-01-01')),
      ]],
    ]));
    const result = await getUpcomingDueDates({
      repo,
      courseIds: [OrgUnitId.of(101)],
      from: new Date('2026-01-01'),
      to: new Date('2026-06-01'),
    });
    expect(result.map((x) => x.name)).toEqual(['InWindow']);
  });

  it('skips assignments without a due date', async () => {
    const repo = new FakeAssignmentRepository(new Map([
      [101, [a(1, 101, 'Undated', null), a(2, 101, 'Dated', new Date('2026-03-01'))]],
    ]));
    const result = await getUpcomingDueDates({
      repo,
      courseIds: [OrgUnitId.of(101)],
      from: new Date('2026-01-01'),
      to: new Date('2026-06-01'),
    });
    expect(result.map((x) => x.name)).toEqual(['Dated']);
  });

  it('returns empty array when no course ids provided', async () => {
    const repo = new FakeAssignmentRepository(new Map());
    const result = await getUpcomingDueDates({
      repo,
      courseIds: [],
      from: new Date('2026-01-01'),
      to: new Date('2026-06-01'),
    });
    expect(result).toEqual([]);
  });
});
