import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import nock from 'nock';

import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lGroupRepository } from '@/contexts/groups/infrastructure/D2lGroupRepository.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

const BASE = 'https://sandbox.d2l.com';

function makeRepo(): D2lGroupRepository {
  const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
  return new D2lGroupRepository(client, { lp: '1.59' });
}

describe('D2lGroupRepository.findMyGroups', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns only groups the current user is enrolled in, with member names from classlist', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/users/whoami').reply(200, { Identifier: '42' });
    nock(BASE).get('/d2l/api/lp/1.59/100/groupcategories/').reply(200, [
      { GroupCategoryId: 1, Name: 'Lab Groups' },
    ]);
    nock(BASE).get('/d2l/api/lp/1.59/100/classlist/').reply(200, [
      { Identifier: '42', DisplayName: 'Me Myself', UserName: 'me' },
      { Identifier: '7', DisplayName: 'Carlos' },
    ]);
    nock(BASE).get('/d2l/api/lp/1.59/100/groupcategories/1/groups/').reply(200, [
      { GroupId: 99, Name: 'Group 9', Enrollments: [42, 7] },
      { GroupId: 100, Name: 'Group 10', Enrollments: [1, 2, 3] }, // not me
    ]);

    const groups = await makeRepo().findMyGroups(createOrgUnitId('100'));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('Group 9');
    expect(groups[0]!.members.find((m) => m.userId === 42)!.username).toBe('me');
    expect(groups[0]!.members.find((m) => m.userId === 7)!.displayName).toBe('Carlos');
  });

  it('returns empty when whoami yields a non-numeric identifier', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/users/whoami').reply(200, { Identifier: 'invalid' });
    expect(await makeRepo().findMyGroups(createOrgUnitId('100'))).toEqual([]);
  });

  it('returns empty when groupcategories endpoint 404s', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/users/whoami').reply(200, { Identifier: '42' });
    nock(BASE).get('/d2l/api/lp/1.59/100/groupcategories/').reply(404, '');
    expect(await makeRepo().findMyGroups(createOrgUnitId('100'))).toEqual([]);
  });

  it('falls back to "User N" label when classlist is unavailable', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/users/whoami').reply(200, { Identifier: '42' });
    nock(BASE).get('/d2l/api/lp/1.59/100/groupcategories/').reply(200, [
      { GroupCategoryId: 1, Name: 'Lab' },
    ]);
    nock(BASE).get('/d2l/api/lp/1.59/100/classlist/').reply(403, '');
    nock(BASE).get('/d2l/api/lp/1.59/100/groupcategories/1/groups/').reply(200, [
      { GroupId: 99, Name: 'G', Enrollments: [42, 7] },
    ]);
    const groups = await makeRepo().findMyGroups(createOrgUnitId('100'));
    expect(groups[0]!.members.find((m) => m.userId === 7)!.displayName).toBe('User 7');
  });
});
