import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import nock from 'nock';

import { D2lAssignmentRepository } from '@/contexts/assignments/infrastructure/D2lAssignmentRepository';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken';
import { createSubmissionDraft } from '@/contexts/assignments/domain/SubmissionDraft';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const BASE = 'https://school.brightspace.com';

describe('D2lAssignmentRepository.submit', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('POSTs multipart to Dropbox submissions endpoint and returns submission id', async () => {
    const scope = nock(BASE)
      .post(/\/d2l\/api\/le\/1\.91\/100\/dropbox\/folders\/42\/submissions\/mysubmissions\/$/)
      .reply(200, { SubmissionId: 'sub-1', SubmittedOn: '2026-04-23T10:00:00Z' });

    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('tok_abc'),
    });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });

    const result = await repo.submit({
      courseId: createOrgUnitId('100'),
      folderId: '42',
      draft: createSubmissionDraft({
        filename: 'hw.txt',
        content: new TextEncoder().encode('hello'),
      }),
    });

    expect(result.submissionId).toBe('sub-1');
    expect(result.submittedAt.toISOString()).toBe('2026-04-23T10:00:00.000Z');
    expect(scope.isDone()).toBe(true);
  });
});
