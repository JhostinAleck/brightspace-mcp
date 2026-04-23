import { describe, it, expect } from 'vitest';
import { handleGetMyGrades } from '@/mcp/tools/get-my-grades.tool';
import { FakeGradeRepository } from '@tests/helpers/fakes/FakeGradeRepository';
import { Grade } from '@/contexts/grades/domain/Grade';

const grade = (id: number, name: string, percent: number) =>
  new Grade({ itemId: id, itemName: name, pointsEarned: percent, pointsMax: 100, percent, displayedGrade: `${percent}` });

describe('get_my_grades tool', () => {
  it('returns compact summary with letter grades', async () => {
    const repo = new FakeGradeRepository(new Map([[101, [grade(1, 'Exam', 87)]]]));
    const r = await handleGetMyGrades({ gradeRepo: repo }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('87.0%');
    expect(r.content[0]?.text).toContain('(B)');
  });

  it('returns detailed when format=detailed', async () => {
    const repo = new FakeGradeRepository(new Map([[101, [grade(1, 'Exam', 87)]]]));
    const r = await handleGetMyGrades({ gradeRepo: repo }, { course_id: 101, format: 'detailed' });
    expect(r.content[0]?.text).toContain('87/100');
    expect(r.content[0]?.text).toContain('[B]');
  });

  it('handles empty grades gracefully', async () => {
    const repo = new FakeGradeRepository(new Map());
    const r = await handleGetMyGrades({ gradeRepo: repo }, { course_id: 999 });
    expect(r.content[0]?.text).toMatch(/no grades/i);
  });
});
