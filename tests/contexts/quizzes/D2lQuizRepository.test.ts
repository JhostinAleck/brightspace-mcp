import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';

import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { QuizAttemptsNotAccessibleError } from '@/contexts/quizzes/domain/QuizAttemptsNotAccessibleError.js';
import { D2lQuizRepository } from '@/contexts/quizzes/infrastructure/D2lQuizRepository.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

const BASE = 'https://sandbox.d2l.com';
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../fixtures/quizzes/${name}`), 'utf-8'));
const page1 = load('quizzes-page1.json');
const page2 = load('quizzes-page2.json');

function makeRepo(): D2lQuizRepository {
  const client = new D2lApiClient({
    baseUrl: BASE,
    getToken: async () => AccessToken.bearer('tok'),
  });
  return new D2lQuizRepository(client, { le: '1.93' });
}

function mockAllPages(): void {
  nock(BASE).get('/d2l/api/le/1.93/100/quizzes/').reply(200, page1);
  nock(BASE).get('/d2l/api/le/1.93/100/quizzes/').query({ bookmark: '300002_2' }).reply(200, page2);
}

describe('D2lQuizRepository', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('follows Next/bookmark pagination and returns every quiz', async () => {
    mockAllPages();
    const result = await makeRepo().findByCourse(createOrgUnitId('100'));
    expect(result.map((q) => q.id)).toEqual([300001, 300002, 300003]);
  });

  it('maps the real D2L quiz shape (dates, IsActive, SubmissionTimeLimit, AttemptsAllowed, rich-text Description)', async () => {
    mockAllPages();
    const [midterm, practice, review] = await makeRepo().findByCourse(createOrgUnitId('100'));

    expect(midterm!.name).toBe('Midterm - Section 1');
    expect(midterm!.startDate?.toISOString()).toBe('2026-05-22T11:30:00.000Z');
    expect(midterm!.endDate?.toISOString()).toBe('2026-05-22T13:00:00.000Z');
    expect(midterm!.dueDate?.toISOString()).toBe('2026-05-22T13:00:00.000Z');
    expect(midterm!.isActive).toBe(true);
    expect(midterm!.attemptsAllowed).toBe(1);
    expect(midterm!.timeLimitMinutes).toBe(80);
    expect(midterm!.autoGrade).toBe(true);
    expect(typeof midterm!.instructions).toBe('string');
    expect(midterm!.instructions).toContain('midterm');

    expect(practice!.isActive).toBe(false);
    expect(practice!.attemptsAllowed).toBeNull(); // IsUnlimited
    expect(practice!.timeLimitMinutes).toBeNull(); // IsEnforced=false
    expect(practice!.instructions).toBeNull(); // empty rich text
    expect(practice!.startDate).toBeNull();
    expect(practice!.dueDate).toBeNull();

    // Falls back to Instructions when Description is empty.
    expect(review!.instructions).toContain('Answer every question.');
    expect(review!.attemptsAllowed).toBe(10);
  });

  it('reports attempts taken as unknown (null), not 0 — the quiz list has no per-student count', async () => {
    mockAllPages();
    const [midterm] = await makeRepo().findByCourse(createOrgUnitId('100'));
    expect(midterm!.attemptsTaken).toBeNull();
    expect(midterm!.attemptsRemaining).toBeNull();
  });

  it('tolerates legacy/loose shapes: Description as flat RichText or string', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/').reply(200, {
      Objects: [
        { QuizId: 1, Name: 'A', Description: { Html: '<p>flat html</p>', Text: 'flat html' } },
        { QuizId: 2, Name: 'B', Description: 'plain string' },
      ],
      Next: null,
    });
    const [a, b] = await makeRepo().findByCourse(createOrgUnitId('100'));
    expect(a!.instructions).toContain('flat html');
    expect(b!.instructions).toBe('plain string');
  });

  it('omits malformed DTOs (missing QuizId or Name)', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/').reply(200, {
      Objects: [
        { QuizId: 1, Name: 'OK' },
        { QuizId: 2 }, // missing name
        { Name: 'No id' },
      ],
    });
    const result = await makeRepo().findByCourse(createOrgUnitId('100'));
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(1);
  });

  it('returns empty when Objects field missing', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/').reply(200, {});
    expect(await makeRepo().findByCourse(createOrgUnitId('100'))).toEqual([]);
  });

  it('maps attempt DTOs (Score as a number) and derives submitted from TimeCompleted', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/1/attempts/').reply(200, {
      Objects: [{
        AttemptId: 9, UserId: 12345, AttemptNumber: 1,
        TimeStarted: '2026-04-01T10:00:00.000Z',
        TimeCompleted: '2026-04-01T10:30:00.000Z',
        Score: 7.5,
        OverallFeedback: { Text: '', Html: '' },
        IsRetakeIncorrectOnly: false,
      }],
      Next: null,
    });
    const [a] = await makeRepo().findAttempts(createOrgUnitId('100'), 1);
    expect(a!.score).toBe(7.5);
    expect(a!.outOf).toBeNull();
    expect(a!.isSubmitted).toBe(true);
    expect(a!.completedAt?.toISOString()).toBe('2026-04-01T10:30:00.000Z');
  });

  it('also accepts Score as { Score, OutOf } and computes percent', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/1/attempts/').reply(200, {
      Objects: [{
        AttemptId: 9, AttemptNumber: 1,
        TimeStarted: '2026-04-01T10:00:00Z',
        TimeCompleted: '2026-04-01T10:30:00Z',
        Score: { Score: 75, OutOf: 100 },
        IsSubmitted: true,
      }],
    });
    const result = await makeRepo().findAttempts(createOrgUnitId('100'), 1);
    expect(result[0]!.percent).toBe(75);
    expect(result[0]!.isSubmitted).toBe(true);
  });

  it('handles in-progress attempts (no TimeCompleted, score=null)', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/1/attempts/').reply(200, {
      Objects: [{
        AttemptId: 9, AttemptNumber: 1,
        TimeStarted: '2026-04-01T10:00:00Z',
        TimeCompleted: null, Score: null,
      }],
    });
    const result = await makeRepo().findAttempts(createOrgUnitId('100'), 1);
    expect(result[0]!.percent).toBeNull();
    expect(result[0]!.completedAt).toBeNull();
    expect(result[0]!.isSubmitted).toBe(false);
  });

  it('follows pagination on attempts', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/1/attempts/').reply(200, {
      Objects: [{ AttemptId: 1, AttemptNumber: 1, TimeStarted: '2026-04-01T10:00:00Z' }],
      Next: `${BASE}/d2l/api/le/1.93/100/quizzes/1/attempts/?bookmark=1`,
    });
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/1/attempts/').query({ bookmark: '1' }).reply(200, {
      Objects: [{ AttemptId: 2, AttemptNumber: 2, TimeStarted: '2026-04-02T10:00:00Z' }],
      Next: null,
    });
    const result = await makeRepo().findAttempts(createOrgUnitId('100'), 1);
    expect(result.map((a) => a.id)).toEqual([1, 2]);
  });

  it('translates 403 (students lack Quizzing.GradeAttempts) into QuizAttemptsNotAccessibleError', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/1/attempts/').reply(403, {
      type: 'http://docs.valence.desire2learn.com/res/apiprop.html#not-authorized',
      title: 'Not Authorized',
      status: 403,
      detail: 'Not authorized for [ orgUnitId: 100, securityVariableName: Quizzing.GradeAttempts ]',
    });
    await expect(makeRepo().findAttempts(createOrgUnitId('100'), 1)).rejects.toBeInstanceOf(QuizAttemptsNotAccessibleError);
  });
});
