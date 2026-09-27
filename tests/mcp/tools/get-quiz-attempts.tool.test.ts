import { describe, expect, it } from 'vitest';

import { handleGetQuizAttempts } from '@/mcp/tools/get-quiz-attempts.tool.js';
import { QuizAttempt } from '@/contexts/quizzes/domain/QuizAttempt.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { QuizAttemptsNotAccessibleError } from '@/contexts/quizzes/domain/QuizAttemptsNotAccessibleError.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

const mkRepo = (attempts: QuizAttempt[]): QuizRepository => ({
  findByCourse: async () => [],
  findAttempts: async () => attempts,
});

describe('handleGetQuizAttempts', () => {
  it('returns "no attempts" message when the list is empty', async () => {
    const result = await handleGetQuizAttempts({ quizRepo: mkRepo([]), output: testOutputContext() }, { course_id: 100, quiz_id: 1 });
    expect(result.content[0]?.text).toContain('No attempts');
  });

  it('renders graded attempts with score, percent, and submitted state', async () => {
    const result = await handleGetQuizAttempts(
      { quizRepo: mkRepo([
        new QuizAttempt({
          id: 99, quizId: 1, attemptNumber: 1,
          startedAt: new Date('2026-04-01T10:00:00Z'),
          completedAt: new Date('2026-04-01T10:30:00Z'),
          score: 8, outOf: 10, isSubmitted: true,
        }),
      ]), output: testOutputContext() },
      { course_id: 100, quiz_id: 1 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Attempt 1');
    expect(text).toContain('8/10');
    expect(text).toContain('80%');
    expect(text).toContain('submitted');
  });

  it('marks ungraded in-progress attempts', async () => {
    const result = await handleGetQuizAttempts(
      { quizRepo: mkRepo([
        new QuizAttempt({
          id: 100, quizId: 1, attemptNumber: 1,
          startedAt: new Date('2026-04-01T10:00:00Z'),
          completedAt: null, score: null, outOf: null, isSubmitted: false,
        }),
      ]), output: testOutputContext() },
      { course_id: 100, quiz_id: 1 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('ungraded');
    expect(text).toContain('in progress');
    expect(text).toContain('not completed');
  });

  it('explains (instead of erroring) when the tenant forbids listing attempts', async () => {
    const repo: QuizRepository = {
      findByCourse: async () => [],
      findAttempts: async () => { throw new QuizAttemptsNotAccessibleError(1); },
    };
    const result = await handleGetQuizAttempts({ quizRepo: repo, output: testOutputContext() }, { course_id: 100, quiz_id: 1 });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Quizzing.GradeAttempts');
    expect(text).toContain('get_my_grades');
  });

  it('renders score without OutOf and formats times in the configured timezone', async () => {
    const result = await handleGetQuizAttempts(
      { quizRepo: mkRepo([
        new QuizAttempt({
          id: 7, quizId: 1, attemptNumber: 2,
          startedAt: new Date('2026-09-29T03:00:00Z'),
          completedAt: new Date('2026-09-29T04:59:00Z'),
          score: 7.5, outOf: null, isSubmitted: true,
        }),
      ]), output: testOutputContext({ tz: 'America/Bogota', locale: 'en-US' }) },
      { course_id: 100, quiz_id: 1 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('score 7.5');
    expect(text).not.toContain('ungraded');
    expect(text).toContain('11:59');
    expect(text).not.toContain('T04:59');
  });
});
