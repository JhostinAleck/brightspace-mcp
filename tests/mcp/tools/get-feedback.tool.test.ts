import { describe, it, expect } from 'vitest';
import { handleGetFeedback } from '@/mcp/tools/get-feedback.tool';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { Feedback } from '@/contexts/assignments/domain/Feedback';
import { testOutputContext } from '../../helpers/test-output-context.js';

describe('get_feedback tool', () => {
  it('formats feedback with score, percent, text', async () => {
    const fb = new Feedback({ score: 88, outOf: 100, text: 'good', releasedAt: new Date('2026-04-25') });
    const repo = new FakeAssignmentRepository(new Map(), new Map([[`${101}:${5001}`, fb]]));
    const r = await handleGetFeedback({ assignmentRepo: repo, output: testOutputContext() }, { course_id: 101, assignment_id: 5001 });
    expect(r.content[0]?.text).toContain('88/100');
    expect(r.content[0]?.text).toContain('good');
  });

  it('returns "no feedback" message when none', async () => {
    const repo = new FakeAssignmentRepository(new Map());
    const r = await handleGetFeedback({ assignmentRepo: repo, output: testOutputContext() }, { course_id: 101, assignment_id: 5001 });
    expect(r.content[0]?.text).toMatch(/no feedback/i);
  });

  it('renders per-criterion rubric outcomes with levels, scores and comments', async () => {
    const fb = new Feedback({
      score: 4.5,
      outOf: 5,
      text: 'Good work overall.',
      releasedAt: null,
      rubricAssessments: [{
        rubricId: 8001,
        rubricName: 'Lab 4 rubric',
        score: 9,
        maxPoints: 10,
        levelName: 'Excellent',
        feedback: null,
        criteria: [
          { groupName: 'Analysis', criterionName: 'Identifies issues', levelName: 'Level 2', score: 5, maxPoints: 5, feedback: null },
          { groupName: 'Analysis', criterionName: 'Justifies findings', levelName: 'Level 1', score: 1, maxPoints: 3, feedback: 'Add sources.' },
        ],
      }],
    });
    const repo = new FakeAssignmentRepository(new Map(), new Map([['101:7001', fb]]));
    const text = (await handleGetFeedback({ assignmentRepo: repo, output: testOutputContext({ locale: 'en-US' }) }, { course_id: 101, assignment_id: 7001 })).content[0]!.text;
    expect(text).toContain('4.5/5');
    expect(text).toContain('Good work overall.');
    expect(text).toContain('Lab 4 rubric');
    expect(text).toContain('9/10');
    expect(text).toContain('Excellent');
    expect(text).toContain('| Group | Criterion | Level | Score | Feedback |');
    expect(text).toContain('| Analysis | Justifies findings | Level 1 | 1/3 | Add sources. |');
  });

  it('says clearly that the assignment is not graded yet', async () => {
    const repo = new FakeAssignmentRepository(new Map());
    const r = await handleGetFeedback({ assignmentRepo: repo, output: testOutputContext({ locale: 'en-US' }) }, { course_id: 101, assignment_id: 5001 });
    expect(r.content[0]?.text).toMatch(/not graded yet/i);
  });
});
