import { describe, it, expect } from 'vitest';
import { handleGetAssignmentRubric } from '@/mcp/tools/get-assignment-rubric.tool';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { Rubric } from '@/contexts/assignments/domain/Rubric';
import { testOutputContext } from '../../helpers/test-output-context.js';

const rubric = new Rubric({
  id: 8001,
  name: 'Lab 4 rubric',
  description: 'Applies to the written report.',
  overallLevels: [
    { id: 8101, name: 'Excellent', rangeStart: 85 },
    { id: 8102, name: 'Poor', rangeStart: 0 },
  ],
  groups: [
    {
      name: 'Analysis',
      levels: [
        { id: 8201, name: 'Level 2', points: null },
        { id: 8202, name: 'Level 1', points: null },
      ],
      criteria: [
        {
          id: 8301,
          name: 'Identifies issues',
          cells: [
            { levelId: 8201, description: 'Identifies all issues.', points: 5 },
            { levelId: 8202, description: 'Identifies few | some issues.', points: 0 },
          ],
        },
      ],
    },
    {
      name: 'Report',
      levels: [
        { id: 8401, name: 'Complete', points: 2 },
        { id: 8402, name: 'Missing', points: 0 },
      ],
      criteria: [
        {
          id: 8501,
          name: 'Formatting',
          cells: [
            { levelId: 8401, description: 'Well formatted.', points: null },
            { levelId: 8402, description: '', points: null },
          ],
        },
      ],
    },
  ],
});

function deps(rubrics: Rubric[] = [rubric], locale: 'en-US' | 'es-419' = 'en-US') {
  return {
    assignmentRepo: new FakeAssignmentRepository(new Map(), new Map(), new Map([['101:7001', rubrics]])),
    output: testOutputContext({ locale }),
  };
}

describe('get_assignment_rubric tool', () => {
  it('renders one markdown table per criteria group with levels as columns', async () => {
    const r = await handleGetAssignmentRubric(deps(), { course_id: 101, assignment_id: 7001 });
    const text = r.content[0]!.text;
    expect(text).toContain('Lab 4 rubric');
    expect(text).toContain('Applies to the written report.');
    expect(text).toContain('#### Analysis');
    expect(text).toContain('#### Report');
    expect(text).toContain('| Criterion | Level 2 | Level 1 |');
    expect(text).toContain('Identifies issues');
    expect(text).toContain('**5 pts** — Identifies all issues.');
    // pipes inside cell text must not break the table
    expect(text).toContain('few \\| some');
  });

  it('shows level-wide points in the header and falls back to them for cells', async () => {
    const text = (await handleGetAssignmentRubric(deps(), { course_id: 101, assignment_id: 7001 })).content[0]!.text;
    expect(text).toContain('Complete (2 pts)');
    expect(text).toContain('**2 pts** — Well formatted.');
    expect(text).toContain('**0 pts**');
  });

  it('summarises size, max points and overall levels', async () => {
    const text = (await handleGetAssignmentRubric(deps(), { course_id: 101, assignment_id: 7001 })).content[0]!.text;
    expect(text).toContain('2 criteria groups');
    expect(text).toContain('2 criteria');
    expect(text).toContain('7 pts');
    expect(text).toContain('Excellent ≥ 85');
  });

  it('localizes labels (es-419)', async () => {
    const text = (await handleGetAssignmentRubric(deps([rubric], 'es-419'), { course_id: 101, assignment_id: 7001 })).content[0]!.text;
    expect(text).toContain('Rúbrica');
    expect(text).toContain('| Criterio |');
  });

  it('says so when the assignment has no rubric', async () => {
    const text = (await handleGetAssignmentRubric(deps([]), { course_id: 101, assignment_id: 7001 })).content[0]!.text;
    expect(text).toMatch(/no rubric/i);
  });

  it('rejects invalid input', async () => {
    await expect(handleGetAssignmentRubric(deps(), { course_id: 101 })).rejects.toThrow();
  });
});
