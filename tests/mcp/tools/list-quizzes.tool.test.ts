import { describe, expect, it } from 'vitest';

import { handleListQuizzes } from '@/mcp/tools/list-quizzes.tool.js';
import { Quiz } from '@/contexts/quizzes/domain/Quiz.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

const mkRepo = (quizzes: Quiz[]): QuizRepository => ({
  findByCourse: async () => quizzes,
  findAttempts: async () => [],
});

describe('handleListQuizzes', () => {
  it('returns "no quizzes" when the course has none', async () => {
    const result = await handleListQuizzes({ quizRepo: mkRepo([]), output: testOutputContext() }, { course_id: 100 });
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
      ]), output: testOutputContext() },
      { course_id: 100 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Quiz 1');
    expect(text).toContain('1/3 taken');
    expect(text).toContain('2 remaining');
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
      ]), output: testOutputContext() },
      { course_id: 100, format: 'detailed' },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Time limit: 60 min');
    expect(text).toContain('Read carefully');
    expect(text).toContain('unlimited');
  });

  it('shows attempts allowed (not "0 taken") when the taken count is unknown', async () => {
    const result = await handleListQuizzes(
      { quizRepo: mkRepo([
        new Quiz({
          id: 2, courseOrgUnitId: 100, name: 'Parcial 1',
          startDate: null, endDate: null,
          attemptsTaken: null, attemptsAllowed: 1, timeLimitMinutes: null,
          autoGrade: false, instructions: null,
        }),
        new Quiz({
          id: 3, courseOrgUnitId: 100, name: 'Practice',
          startDate: null, endDate: null,
          attemptsTaken: null, attemptsAllowed: null, timeLimitMinutes: null,
          autoGrade: false, instructions: null,
        }),
      ]), output: testOutputContext() },
      { course_id: 100 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('1 attempt allowed');
    expect(text).toContain('unlimited attempts');
    expect(text).not.toContain('0 taken');
  });

  it('formats due/close dates in the configured timezone and flags inactive quizzes', async () => {
    const result = await handleListQuizzes(
      { quizRepo: mkRepo([
        new Quiz({
          id: 4, courseOrgUnitId: 100, name: 'Quiz 2',
          startDate: new Date('2026-09-28T13:00:00Z'),
          endDate: new Date('2026-09-29T04:59:59Z'),
          dueDate: new Date('2026-09-29T04:59:59Z'),
          isActive: false,
          attemptsTaken: null, attemptsAllowed: 1, timeLimitMinutes: 70,
          autoGrade: true, instructions: null,
        }),
      ]), output: testOutputContext({ tz: 'America/Bogota', locale: 'en-US' }) },
      { course_id: 100, format: 'detailed' },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Due:');
    expect(text).toContain('Opens:');
    expect(text).toContain('Sep 28');
    expect(text).toContain('11:59');
    expect(text).not.toContain('2026-09-29T04:59');
    expect(text).toContain('inactive');
  });

  it('detailed format strips HTML/entities and never crashes on non-string instructions', async () => {
    const result = await handleListQuizzes(
      { quizRepo: mkRepo([
        new Quiz({
          id: 5, courseOrgUnitId: 100, name: 'Midterm',
          startDate: null, endDate: null,
          attemptsTaken: null, attemptsAllowed: 1, timeLimitMinutes: null,
          autoGrade: false, instructions: '<p>This is the midterm&#160;&amp; more</p>',
        }),
        new Quiz({
          id: 6, courseOrgUnitId: 100, name: 'Weird',
          startDate: null, endDate: null,
          attemptsTaken: null, attemptsAllowed: 1, timeLimitMinutes: null,
          autoGrade: false,
          // Simulates an unexpected upstream shape leaking through.
          instructions: { Text: { Text: 'x', Html: '<p>x</p>' } } as unknown as string,
        }),
      ]), output: testOutputContext() },
      { course_id: 100, format: 'detailed' },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('This is the midterm');
    expect(text).toContain('& more');
    expect(text).not.toContain('<p>');
    expect(text).toContain('Weird');
  });
});
