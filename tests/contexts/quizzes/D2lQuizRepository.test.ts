import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import nock from 'nock';

import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lQuizRepository } from '@/contexts/quizzes/infrastructure/D2lQuizRepository.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

const BASE = 'https://sandbox.d2l.com';

function makeRepo(): D2lQuizRepository {
  const client = new D2lApiClient({
    baseUrl: BASE,
    getToken: async () => AccessToken.bearer('tok'),
  });
  return new D2lQuizRepository(client, { le: '1.93' });
}

describe('D2lQuizRepository', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('maps quiz DTOs to domain Quiz objects', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/').reply(200, {
      Objects: [{
        QuizId: 1, Name: 'Quiz 1',
        StartDate: null, EndDate: '2026-06-01T23:59:00Z',
        AttemptsAllowed: { Type: { Id: 1 }, NumberOfAttemptsAllowed: 3 },
        Submissions: 1,
        TimeLimit: { IsEnforced: true, TimeLimitValue: 30 },
        AutoSetGraded: true,
        Description: { Html: '<p>read carefully</p>' },
      }],
    });
    const result = await makeRepo().findByCourse(createOrgUnitId('100'));
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Quiz 1');
    expect(result[0]!.attemptsAllowed).toBe(3);
    expect(result[0]!.attemptsRemaining).toBe(2);
    expect(result[0]!.timeLimitMinutes).toBe(30);
    expect(result[0]!.autoGrade).toBe(true);
  });

  it('treats AttemptsAllowed.Type.Id=0 (unlimited) as null', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/').reply(200, {
      Objects: [{
        QuizId: 1, Name: 'Q',
        AttemptsAllowed: { Type: { Id: 0 }, NumberOfAttemptsAllowed: 99 },
      }],
    });
    const result = await makeRepo().findByCourse(createOrgUnitId('100'));
    expect(result[0]!.attemptsAllowed).toBeNull();
    expect(result[0]!.attemptsRemaining).toBeNull();
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

  it('maps attempt DTOs with computed percent', async () => {
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

  it('handles ungraded attempts (score=null)', async () => {
    nock(BASE).get('/d2l/api/le/1.93/100/quizzes/1/attempts/').reply(200, {
      Objects: [{
        AttemptId: 9, AttemptNumber: 1,
        TimeStarted: '2026-04-01T10:00:00Z',
        TimeCompleted: null, Score: null, IsSubmitted: false,
      }],
    });
    const result = await makeRepo().findAttempts(createOrgUnitId('100'), 1);
    expect(result[0]!.percent).toBeNull();
    expect(result[0]!.completedAt).toBeNull();
  });
});
