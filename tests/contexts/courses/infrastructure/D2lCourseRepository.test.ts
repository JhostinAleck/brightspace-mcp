import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lCourseRepository } from '@/contexts/courses/infrastructure/D2lCourseRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { CourseId } from '@/contexts/courses/CourseId.js';

const BASE = 'https://x.com';
const fixturePath = resolve(__dirname, '../../../fixtures/enrollments/happy-path.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const rosterFixture = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/roster/happy-path.json'), 'utf-8'));

afterEach(() => nock.cleanAll());

describe('D2lCourseRepository.findMyCourses', () => {
  it('parses enrollments and returns Course[]', async () => {
    nock(BASE).get(/\/d2l\/api\/lp\/1\.56\/enrollments\/myenrollments\/.*/).reply(200, fixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    const courses = await repo.findMyCourses();
    expect(courses).toHaveLength(2);
    expect(courses[0]?.name).toBe('ECE 264');
    expect(courses[1]?.active).toBe(false);
  });

  it('filters by activeOnly', async () => {
    nock(BASE).get(/\/d2l\/api\/lp\/1\.56\/enrollments\/myenrollments\/.*/).reply(200, fixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    const courses = await repo.findMyCourses({ activeOnly: true });
    expect(courses).toHaveLength(1);
    expect(courses[0]?.name).toBe('ECE 264');
  });

  it('findRoster parses classlist users into Classmate entities with roles', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/101/classlist/').reply(200, rosterFixture.classlist);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    const roster = await repo.findRoster(CourseId.of(101));
    expect(roster).toHaveLength(3);
    expect(roster.find((m) => m.displayName === 'Alice Student')?.role).toBe('student');
    expect(roster.find((m) => m.displayName === 'Bob Instructor')?.role).toBe('instructor');
    expect(roster.find((m) => m.displayName === 'Carol TA')?.role).toBe('ta');
  });

  it('findClasslistEmails returns only non-null emails', async () => {
    nock(BASE).get('/d2l/api/lp/1.56/101/classlist/email/').reply(200, rosterFixture.emails);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    const emails = await repo.findClasslistEmails(CourseId.of(101));
    expect(emails).toEqual(['alice@x.edu', 'bob@x.edu']);
  });
});
