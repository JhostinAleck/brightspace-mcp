import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';

import { D2lAssignmentRepository } from '@/contexts/assignments/infrastructure/D2lAssignmentRepository';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';

const BASE = 'https://x.com';
const API = '/d2l/api/le/1.91/101/dropbox/folders/11/submissions';
const LIST = '/d2l/lms/dropbox/user/folders_list.d2l?ou=101';
const HISTORY = '/d2l/lms/dropbox/user/folders_history.d2l?db=11&grpid=900&isprv=0&bp=0&ou=101';
const listHtml = '<a href="folders_history.d2l?db=11&amp;grpid=900&amp;isprv=0&amp;bp=0&amp;ou=101">History</a>';
const historyHtml = readFileSync(resolve(__dirname, '../../../fixtures/assignments/submission-history-group.html'), 'utf-8');

function repo() {
  const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
  return new D2lAssignmentRepository(client, { le: '1.91' });
}
const find = () => repo().findMySubmissions(OrgUnitId.of(101), AssignmentId.of(11));

afterEach(() => nock.cleanAll());

describe('D2lAssignmentRepository.findMySubmissions', () => {
  it('maps the mysubmissions API, newest first, skipping deleted files', async () => {
    nock(BASE).get(`${API}/mysubmissions/`).reply(200, [{
      Entity: { EntityId: 900, EntityType: 'Group' },
      Submissions: [
        { Id: 5, SubmissionDate: '2030-01-10T14:00:00.000Z', SubmittedBy: { DisplayName: 'Student Example' },
          Files: [{ FileId: 50, FileName: 'draft.pdf', Size: 2048 }] },
        { Id: 6, SubmissionDate: '2030-01-12T14:00:00.000Z', Comment: { Text: ' final ' },
          Files: [{ FileId: 60, FileName: 'report.pdf', Size: 1048576 }, { FileId: 61, FileName: 'old.pdf', IsDeleted: true }] },
      ],
    }]);
    const subs = await find();
    expect(subs.map((s) => s.id)).toEqual(['6', '5']);
    expect(subs[0]).toEqual({
      id: '6',
      submittedAt: new Date('2030-01-12T14:00:00.000Z'),
      submittedAtLabel: null,
      submittedBy: null,
      comment: 'final',
      files: [{ name: 'report.pdf', sizeBytes: 1048576, sizeLabel: null, url: `${API}/6/files/60` }],
    });
    expect(subs[1]?.submittedBy).toBe('Student Example');
  });

  it('falls back to the UI history page when the API answers 403 (closed folder)', async () => {
    nock(BASE)
      .get(`${API}/mysubmissions/`).reply(403, '')
      .get(LIST).reply(200, listHtml)
      .get(HISTORY).reply(200, historyHtml);
    const subs = await find();
    expect(subs.map((s) => s.id)).toEqual(['7000002', '7000001']);
    expect(subs[0]?.files.map((f) => f.name)).toEqual(['report.pdf', 'data set.csv']);
  });

  it('cross-checks an empty API answer against the history page', async () => {
    nock(BASE)
      .get(`${API}/mysubmissions/`).reply(200, [])
      .get(LIST).reply(200, listHtml)
      .get(HISTORY).reply(200, historyHtml);
    expect(await find()).toHaveLength(2);
  });

  it('returns no submissions when the folder has no history link', async () => {
    nock(BASE)
      .get(`${API}/mysubmissions/`).reply(403, '')
      .get(LIST).reply(200, '<html>no history links</html>');
    expect(await find()).toEqual([]);
  });

  it('treats a failing cross-check as no submissions', async () => {
    nock(BASE)
      .get(`${API}/mysubmissions/`).reply(200, [])
      .get(LIST).reply(500, '');
    expect(await find()).toEqual([]);
  });

  it('propagates unexpected API errors', async () => {
    nock(BASE).get(`${API}/mysubmissions/`).times(5).reply(401, '');
    await expect(find()).rejects.toThrow();
  });
});
