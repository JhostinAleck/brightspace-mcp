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
});
