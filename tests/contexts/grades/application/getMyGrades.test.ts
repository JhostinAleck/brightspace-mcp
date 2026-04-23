import { describe, it, expect } from 'vitest';
import { getMyGrades } from '@/contexts/grades/application/getMyGrades';
import { Grade } from '@/contexts/grades/domain/Grade';
import { FakeGradeRepository } from '@tests/helpers/fakes/FakeGradeRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const g = (id: number, name: string, percent: number | null) =>
  new Grade({
    itemId: id,
    itemName: name,
    pointsEarned: percent === null ? null : percent,
    pointsMax: 100,
    percent,
    displayedGrade: percent === null ? null : `${percent}`,
  });

describe('getMyGrades', () => {
  it('returns the grades for the requested course', async () => {
    const repo = new FakeGradeRepository(new Map([[101, [g(1, 'Exam 1', 87)]]]));
    const grades = await getMyGrades({ repo, courseId: OrgUnitId.of(101) });
    expect(grades).toHaveLength(1);
    expect(grades[0]?.itemName).toBe('Exam 1');
  });

  it('returns an empty array when the course has no grades', async () => {
    const repo = new FakeGradeRepository(new Map());
    const grades = await getMyGrades({ repo, courseId: OrgUnitId.of(999) });
    expect(grades).toEqual([]);
  });
});
