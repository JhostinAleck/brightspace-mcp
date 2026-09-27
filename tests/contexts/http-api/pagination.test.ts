import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import nock from 'nock';

import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { fetchAllObjectListPages, nextPagePath } from '@/contexts/http-api/pagination.js';

const BASE = 'https://sandbox.d2l.com';

function makeClient(): D2lApiClient {
  return new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('tok') });
}

describe('nextPagePath', () => {
  it('returns null for null/undefined/empty Next', () => {
    expect(nextPagePath(null)).toBeNull();
    expect(nextPagePath(undefined)).toBeNull();
    expect(nextPagePath('')).toBeNull();
  });

  it('turns an absolute D2L Next URL into a relative API path (host is dropped)', () => {
    expect(nextPagePath('https://school.example.edu/d2l/api/le/1.99/100/quizzes/?bookmark=334344_24'))
      .toBe('/d2l/api/le/1.99/100/quizzes/?bookmark=334344_24');
  });

  it('accepts an already-relative API path', () => {
    expect(nextPagePath('/d2l/api/le/1.99/100/quizzes/?bookmark=1_2')).toBe('/d2l/api/le/1.99/100/quizzes/?bookmark=1_2');
  });

  it('refuses paths outside /d2l/api/', () => {
    expect(nextPagePath('https://evil.example.com/steal?x=1')).toBeNull();
    expect(nextPagePath('not a url at all')).toBeNull();
  });
});

describe('fetchAllObjectListPages', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('follows Next links until exhausted and concatenates Objects', async () => {
    nock(BASE).get('/d2l/api/le/1.99/100/quizzes/').reply(200, {
      Objects: [{ id: 1 }, { id: 2 }],
      Next: `${BASE}/d2l/api/le/1.99/100/quizzes/?bookmark=2_2`,
    });
    nock(BASE).get('/d2l/api/le/1.99/100/quizzes/').query({ bookmark: '2_2' }).reply(200, {
      Objects: [{ id: 3 }],
      Next: `${BASE}/d2l/api/le/1.99/100/quizzes/?bookmark=3_3`,
    });
    nock(BASE).get('/d2l/api/le/1.99/100/quizzes/').query({ bookmark: '3_3' }).reply(200, {
      Objects: [{ id: 4 }],
      Next: null,
    });
    const all = await fetchAllObjectListPages<{ id: number }>(makeClient(), '/d2l/api/le/1.99/100/quizzes/');
    expect(all.map((o) => o.id)).toEqual([1, 2, 3, 4]);
  });

  it('tolerates a page without Objects', async () => {
    nock(BASE).get('/d2l/api/le/1.99/100/quizzes/').reply(200, {});
    expect(await fetchAllObjectListPages(makeClient(), '/d2l/api/le/1.99/100/quizzes/')).toEqual([]);
  });

  it('stops on a cyclic Next link instead of looping forever', async () => {
    nock(BASE).get('/d2l/api/le/1.99/100/quizzes/').reply(200, {
      Objects: [{ id: 1 }],
      Next: `${BASE}/d2l/api/le/1.99/100/quizzes/?bookmark=a`,
    });
    nock(BASE).get('/d2l/api/le/1.99/100/quizzes/').query({ bookmark: 'a' }).reply(200, {
      Objects: [{ id: 2 }],
      Next: `${BASE}/d2l/api/le/1.99/100/quizzes/?bookmark=a`,
    });
    const all = await fetchAllObjectListPages<{ id: number }>(makeClient(), '/d2l/api/le/1.99/100/quizzes/');
    expect(all.map((o) => o.id)).toEqual([1, 2]);
  });
});
