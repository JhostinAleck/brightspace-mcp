import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lAssignmentRepository } from '@/contexts/assignments/infrastructure/D2lAssignmentRepository';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';

const BASE = 'https://x.com';
const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../fixtures/assignments/${name}`), 'utf-8'));
const folder = fixture('folder-with-rubric.json');
const gradeValue = fixture('grade-value.json');
const assessment = fixture('rubric-assessment.json');

const FOLDER = '/d2l/api/le/1.99/101/dropbox/folders/7001';
const GRADE = '/d2l/api/le/1.99/101/grades/9001/values/myGradeValue';
const WHOAMI = '/d2l/api/lp/1.63/users/whoami';
const ASSESSMENT = '/d2l/api/le/unstable/101/assessment';
const assessmentQuery = { assessmentType: 'Rubric', objectType: 'Dropbox', objectId: '7001', rubricId: '8001', userId: '12345' };

function repo(opts: { lp?: string } = { lp: '1.63' }) {
  const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
  return new D2lAssignmentRepository(client, { le: '1.99', ...opts });
}

afterEach(() => nock.cleanAll());

describe('D2lAssignmentRepository.findFeedback', () => {
  it('combines the released grade value with the per-criterion rubric assessment', async () => {
    nock(BASE).get(FOLDER).reply(200, folder);
    nock(BASE).get(GRADE).reply(200, gradeValue);
    nock(BASE).get(WHOAMI).reply(200, { Identifier: '12345' });
    nock(BASE).get(ASSESSMENT).query(assessmentQuery).reply(200, assessment);

    const fb = await repo().findFeedback(OrgUnitId.of(101), AssignmentId.of(7001));
    expect(fb).not.toBeNull();
    expect(fb!.score).toBe(4.5);
    expect(fb!.outOf).toBe(5);
    expect(fb!.text).toBe('Good work overall.');
    expect(fb!.displayedGrade).toBe('4.50');
    expect(fb!.releasedAt?.toISOString()).toBe('2026-09-21T15:00:00.000Z');

    expect(fb!.rubricAssessments).toHaveLength(1);
    const ra = fb!.rubricAssessments[0]!;
    expect(ra.rubricName).toBe('Lab 4 rubric');
    expect(ra.score).toBe(9);
    expect(ra.maxPoints).toBe(10);
    expect(ra.levelName).toBe('Excellent');
    expect(ra.criteria).toHaveLength(3);
    expect(ra.criteria[0]).toEqual({
      groupName: 'Analysis',
      criterionName: 'Identifies issues',
      levelName: 'Level 2',
      score: 5,
      maxPoints: 5,
      feedback: null,
    });
    expect(ra.criteria[1]?.feedback).toBe('Add sources for each claim.');
    expect(ra.criteria[2]).toMatchObject({ groupName: 'Report', levelName: 'Complete', feedback: 'Nice layout.' });
  });

  it('returns null ("not graded yet") when there is no released grade and no assessment', async () => {
    nock(BASE).get(FOLDER).reply(200, folder);
    nock(BASE).get(GRADE).reply(404, 'Not Found');
    nock(BASE).get(WHOAMI).reply(200, { Identifier: '12345' });
    nock(BASE).get(ASSESSMENT).query(assessmentQuery).reply(200, {
      ...assessment,
      OverallOutcome: { LevelId: null, Score: null, ScoreIsOverridden: false, Feedback: { Text: '', Html: '' }, FeedbackIsOverridden: false },
      CriteriaOutcome: [],
    });
    expect(await repo().findFeedback(OrgUnitId.of(101), AssignmentId.of(7001))).toBeNull();
  });

  it('returns the grade value alone for folders without a rubric (no whoami call)', async () => {
    nock(BASE).get(FOLDER).reply(200, { ...folder, Assessment: { ScoreDenominator: 5, Rubrics: [] } });
    nock(BASE).get(GRADE).reply(200, gradeValue);
    const fb = await repo().findFeedback(OrgUnitId.of(101), AssignmentId.of(7001));
    expect(fb?.score).toBe(4.5);
    expect(fb?.rubricAssessments).toEqual([]);
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('still returns the grade when the rubric assessment route is unavailable', async () => {
    nock(BASE).get(FOLDER).reply(200, folder);
    nock(BASE).get(GRADE).reply(200, gradeValue);
    nock(BASE).get(WHOAMI).reply(200, { Identifier: '12345' });
    nock(BASE).get(ASSESSMENT).query(assessmentQuery).reply(403, { Errors: [{ Message: 'Not Authorized' }] });
    const fb = await repo().findFeedback(OrgUnitId.of(101), AssignmentId.of(7001));
    expect(fb?.score).toBe(4.5);
    expect(fb?.rubricAssessments).toEqual([]);
  });

  it('returns rubric outcomes even when the grade item is not released yet', async () => {
    nock(BASE).get(FOLDER).reply(200, folder);
    nock(BASE).get(GRADE).reply(404, 'Not Found');
    nock(BASE).get(WHOAMI).reply(200, { Identifier: '12345' });
    nock(BASE).get(ASSESSMENT).query(assessmentQuery).reply(200, assessment);
    const fb = await repo().findFeedback(OrgUnitId.of(101), AssignmentId.of(7001));
    expect(fb?.score).toBeNull();
    expect(fb?.outOf).toBe(5);
    expect(fb?.rubricAssessments[0]?.score).toBe(9);
  });

  it('skips rubric outcomes when no LP version is configured', async () => {
    nock(BASE).get(FOLDER).reply(200, folder);
    nock(BASE).get(GRADE).reply(200, gradeValue);
    const fb = await repo({}).findFeedback(OrgUnitId.of(101), AssignmentId.of(7001));
    expect(fb?.rubricAssessments).toEqual([]);
  });

  it('skips the grade lookup when the folder has no grade item', async () => {
    nock(BASE).get(FOLDER).reply(200, { ...folder, GradeItemId: null, Assessment: null });
    expect(await repo().findFeedback(OrgUnitId.of(101), AssignmentId.of(7001))).toBeNull();
  });

  it('returns null when the folder itself is not visible (404)', async () => {
    nock(BASE).get(FOLDER).reply(404, '');
    expect(await repo().findFeedback(OrgUnitId.of(101), AssignmentId.of(7001))).toBeNull();
  });

  it('re-throws unexpected errors from the grade lookup', async () => {
    nock(BASE).get(FOLDER).reply(200, { ...folder, Assessment: null });
    nock(BASE).get(GRADE).reply(500, 'boom');
    await expect(repo().findFeedback(OrgUnitId.of(101), AssignmentId.of(7001))).rejects.toThrow();
  });
});
