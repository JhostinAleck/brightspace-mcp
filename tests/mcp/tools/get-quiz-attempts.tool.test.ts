import { describe, expect, it } from 'vitest';

import { handleGetQuizAttempts } from '@/mcp/tools/get-quiz-attempts.tool.js';
import { QuizAttempt } from '@/contexts/quizzes/domain/QuizAttempt.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';

const mkRepo = (attempts: QuizAttempt[]): QuizRepository => ({
  findByCourse: async () => [],
  findAttempts: async () => attempts,
});

describe('handleGetQuizAttempts', () => {
  it('returns "no attempts" message when the list is empty', async () => {
    const result = await handleGetQuizAttempts({ quizRepo: mkRepo([]) }, { course_id: 100, quiz_id: 1 });
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
      ]) },
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
      ]) },
      { course_id: 100, quiz_id: 1 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('ungraded');
    expect(text).toContain('in progress');
    expect(text).toContain('not completed');
  });
});
