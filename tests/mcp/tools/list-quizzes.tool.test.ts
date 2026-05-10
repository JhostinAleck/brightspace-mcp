import { describe, expect, it } from 'vitest';

import { handleListQuizzes } from '@/mcp/tools/list-quizzes.tool.js';
import { Quiz } from '@/contexts/quizzes/domain/Quiz.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';

const mkRepo = (quizzes: Quiz[]): QuizRepository => ({
  findByCourse: async () => quizzes,
  findAttempts: async () => [],
});

describe('handleListQuizzes', () => {
  it('returns "no quizzes" when the course has none', async () => {
    const result = await handleListQuizzes({ quizRepo: mkRepo([]) }, { course_id: 100 });
    expect(result.content[0]?.text).toContain('No quizzes');
  });

  it('renders compact list with attempts and close date', async () => {
    const result = await handleListQuizzes(
      { quizRepo: mkRepo([
        new Quiz({
          id: 1, courseOrgUnitId: 100, name: 'Quiz 1',
          startDate: null, endDate: new Date('2026-06-01T23:59:00Z'),
          attemptsTaken: 1, attemptsAllowed: 3, timeLimitMinutes: 30,
          autoGrade: true, instructions: null,
        }),
      ]) },
      { course_id: 100 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Quiz 1');
    expect(text).toContain('1/3 taken');
    expect(text).toContain('2 remaining');
    expect(text).toContain('UTC');
  });

  it('renders detailed format with time limit and instructions snippet', async () => {
    const result = await handleListQuizzes(
      { quizRepo: mkRepo([
        new Quiz({
          id: 1, courseOrgUnitId: 100, name: 'Q',
          startDate: null, endDate: null,
          attemptsTaken: 0, attemptsAllowed: null, timeLimitMinutes: 60,
          autoGrade: false, instructions: '<p>Read carefully</p>',
        }),
      ]) },
      { course_id: 100, format: 'detailed' },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Time limit: 60 min');
    expect(text).toContain('Read carefully');
    expect(text).toContain('unlimited');
  });
});
