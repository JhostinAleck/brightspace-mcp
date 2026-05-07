import { afterEach, describe, expect, it } from 'vitest';
import nock from 'nock';
import { D2lCourseRepository } from '@/contexts/courses/infrastructure/D2lCourseRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';

const BASE = 'https://x.com';

afterEach(() => nock.cleanAll());

describe('D2lCourseRepository.findById', () => {
  it('uses the orgstructure endpoint for an O(1) lookup', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/orgstructure/101').reply(200, {
      Identifier: 101,
      Name: 'ECE 264',
      Code: 'ECE264-2026F',
      Type: { Code: 'Course Offering' },
    });
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
    });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    const course = await repo.findById(CourseId.of(101));
    expect(course?.name).toBe('ECE 264');
    expect(course?.code).toBe('ECE264-2026F');
  });

  it('returns null when the orgstructure entry is not a course-shaped org unit', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/orgstructure/999').reply(200, {
      Identifier: 999,
      Name: 'Department of CS',
      Code: 'CS-DEPT',
      Type: { Code: 'Department' },
    });
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
    });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    expect(await repo.findById(CourseId.of(999))).toBeNull();
  });

  it('falls back to enrollments scan when orgstructure is forbidden (403)', async () => {
    nock(BASE)
      .get('/d2l/api/lp/1.56/orgstructure/101')
      .reply(403, 'forbidden')
      .get(/\/d2l\/api\/lp\/1\.56\/enrollments\/myenrollments\/.*/)
      .reply(200, {
        PagingInfo: { HasMoreItems: false },
        Items: [
          {
            OrgUnit: { Id: 101, Name: 'ECE 264', Code: 'ECE264', Type: { Code: 'Course' } },
            Access: { IsActive: true },
          },
        ],
      });
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
    });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    const course = await repo.findById(CourseId.of(101));
    expect(course?.name).toBe('ECE 264');
  });

  it('falls back to enrollments scan when orgstructure 404s', async () => {
    nock(BASE)
      .get('/d2l/api/lp/1.56/orgstructure/123')
      .reply(404, 'not found')
      .get(/\/d2l\/api\/lp\/1\.56\/enrollments\/myenrollments\/.*/)
      .reply(200, { PagingInfo: { HasMoreItems: false }, Items: [] });
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
    });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    expect(await repo.findById(CourseId.of(123))).toBeNull();
  });

  it('propagates non-403/404 errors instead of silently falling back', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/orgstructure/55').reply(500, 'boom');
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
    });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    await expect(repo.findById(CourseId.of(55))).rejects.toThrow();
  });
});
