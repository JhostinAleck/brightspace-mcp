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
const folderWithRubric = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/assignments/folder-with-rubric.json'), 'utf-8'),
);

const individualFolder = {
  Id: 7002,
  Name: 'Essay',
  CustomInstructions: null,
  DueDate: '2026-10-01T04:59:59.000Z',
  Availability: null,
  Assessment: { ScoreDenominator: null, Rubrics: [] },
  DropboxType: 2,
  GroupTypeId: null,
  LinkAttachments: [],
  SubmissionType: 1,
  AllowableFileType: 0,
  CustomAllowableFileTypes: null,
};

function repo() {
  const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
  return new D2lAssignmentRepository(client, { le: '1.99', lp: '1.63' });
}

afterEach(() => nock.cleanAll());

describe('D2lAssignmentRepository — folder metadata', () => {
  it('maps rubric, points, availability, links, file types and group kind', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/').reply(200, [folderWithRubric, individualFolder]);
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/7001/submissions/mysubmissions/').reply(403, { Errors: [{ Message: 'Not Authorized' }] });
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/7002/submissions/mysubmissions/').reply(200, []);

    const out = await repo().findByCourse(OrgUnitId.of(101));
    const lab = out.find((a) => a.name === 'Lab 4')!;
    const essay = out.find((a) => a.name === 'Essay')!;

    expect(lab.kind).toBe('group');
    expect(lab.points).toBe(5);
    expect(lab.dueDate.hasValue()).toBe(false);
    expect(lab.startDate?.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(lab.endDate?.toISOString()).toBe('2026-09-28T04:59:59.000Z');
    expect(lab.linkAttachments).toEqual([{ name: 'Lab guide', url: 'https://example.edu/lab-guide' }]);
    expect(lab.allowedFileTypes).toEqual({ mode: 'custom', extensions: ['pdf', 'docx'] });
    // D2L sends SubmissionType as a bare number in LE 1.99
    expect(lab.submissionMode).toBe('replace_previous');

    expect(lab.rubrics).toHaveLength(1);
    const rubric = lab.rubrics[0]!;
    expect(rubric.name).toBe('Lab 4 rubric');
    expect(rubric.groups.map((g) => g.name)).toEqual(['Analysis', 'Report']);
    expect(rubric.criterionCount).toBe(3);
    expect(rubric.maxPoints).toBe(10);
    expect(rubric.overallLevels.map((l) => l.name)).toEqual(['Excellent', 'Poor']);
    const justifies = rubric.findCriterion(8302)!;
    // Html-only descriptions are stripped to text
    expect(justifies.criterion.cells[0]?.description).toBe('Clear justification.');

    expect(essay.kind).toBe('individual');
    expect(essay.points).toBeNull();
    expect(essay.rubrics).toEqual([]);
    expect(essay.allowedFileTypes).toEqual({ mode: 'any' });
    expect(essay.submissionMode).toBe('append');
  });

  it('marks submission status unknown (not "not submitted") when mysubmissions is 403/404', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/').reply(200, [folderWithRubric, individualFolder]);
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/7001/submissions/mysubmissions/').reply(404, '');
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/7002/submissions/mysubmissions/').reply(200, []);

    const out = await repo().findByCourse(OrgUnitId.of(101));
    expect(out.find((a) => a.id === AssignmentId.of(7001))?.submissionStatus).toBe('unknown');
    expect(out.find((a) => a.id === AssignmentId.of(7002))?.submissionStatus).toBe('not_submitted');
  });

  it('maps non-custom restricted file types to their raw code', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/').reply(200, [{ ...individualFolder, AllowableFileType: 2 }]);
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/7002/submissions/mysubmissions/').reply(200, []);
    const [a] = await repo().findByCourse(OrgUnitId.of(101));
    expect(a?.allowedFileTypes).toEqual({ mode: 'restricted', code: 2 });
  });
});

describe('D2lAssignmentRepository.findRubrics', () => {
  it('reads rubrics from the single-folder endpoint', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/7001').reply(200, folderWithRubric);
    const rubrics = await repo().findRubrics(OrgUnitId.of(101), AssignmentId.of(7001));
    expect(rubrics).toHaveLength(1);
    expect(rubrics[0]?.id).toBe(8001);
  });

  it('falls back to the rubrics endpoint when the folder omits Assessment.Rubrics', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/7001').reply(200, { ...folderWithRubric, Assessment: { ScoreDenominator: 5 } });
    nock(BASE)
      .get('/d2l/api/le/1.99/101/rubrics')
      .query({ objectType: 'Dropbox', objectId: '7001' })
      .reply(200, folderWithRubric.Assessment.Rubrics);
    const rubrics = await repo().findRubrics(OrgUnitId.of(101), AssignmentId.of(7001));
    expect(rubrics[0]?.name).toBe('Lab 4 rubric');
  });

  it('returns [] when neither source has rubrics', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/dropbox/folders/7002').reply(200, { ...individualFolder, Assessment: null });
    nock(BASE)
      .get('/d2l/api/le/1.99/101/rubrics')
      .query({ objectType: 'Dropbox', objectId: '7002' })
      .reply(404, '');
    expect(await repo().findRubrics(OrgUnitId.of(101), AssignmentId.of(7002))).toEqual([]);
  });
});
