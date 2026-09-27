import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lCourseRepository } from '@/contexts/courses/infrastructure/D2lCourseRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';

const BASE = 'https://x.com';
const fixturePath = resolve(__dirname, '../../../fixtures/enrollments/happy-path.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const currentTermFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/enrollments/current-term.json'), 'utf-8'),
);
const NOW = new Date('2026-09-27T12:00:00Z');
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
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56', now: () => new Date('2026-03-01T00:00:00Z') });
    const courses = await repo.findMyCourses({ activeOnly: true });
    expect(courses).toHaveLength(1);
    expect(courses[0]?.name).toBe('ECE 264');
  });

  it('activeOnly keeps only current courses even though IsActive is true for all of them', async () => {
    nock(BASE).get('/d2l/api/lp/1.63/enrollments/myenrollments/').reply(200, currentTermFixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.99', lp: '1.63', now: () => NOW });
    const courses = await repo.findMyCourses({ activeOnly: true });
    expect(courses.map((c) => CourseId.toNumber(c.id)).sort()).toEqual([5003, 5004, 5006]);
  });

  it('without activeOnly returns every course offering, flagging past ones inactive', async () => {
    nock(BASE).get('/d2l/api/lp/1.63/enrollments/myenrollments/').reply(200, currentTermFixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.99', lp: '1.63', now: () => NOW });
    const courses = await repo.findMyCourses();
    expect(courses).toHaveLength(5);
    const byId = new Map(courses.map((c) => [CourseId.toNumber(c.id), c]));
    expect(byId.get(5001)?.active).toBe(false);
    expect(byId.get(5002)?.active).toBe(false);
    expect(byId.get(5003)?.active).toBe(true);
    expect(byId.get(5003)?.endDate?.toISOString()).toBe('2026-12-18T05:00:00.000Z');
  });

  it('findRoster reads the LE classlist and classifies roles by their display name', async () => {
    // The LP classlist route is 404 on real tenants; role ids are tenant-specific
    // (on Uniandes 109 is "Profesor"), so the display name is authoritative.
    nock(BASE).get('/d2l/api/le/1.91/101/classlist/').reply(200, rosterFixture.classlist);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    const roster = await repo.findRoster(CourseId.of(101));
    expect(roster).toHaveLength(4);
    expect(roster.find((m) => m.displayName === 'Alice Student')?.role).toBe('student');
    expect(roster.find((m) => m.displayName === 'Bob Instructor')?.role).toBe('instructor');
    expect(roster.find((m) => m.displayName === 'Carol TA')?.role).toBe('ta');
    expect(roster.find((m) => m.displayName === 'Dan CoTeacher')?.role).toBe('instructor');
    expect(roster.find((m) => m.displayName === 'Alice Student')?.uniqueName).toBe('alice');
  });

  it('findClasslistEmails returns only non-empty emails from the LE classlist', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/classlist/').reply(200, rosterFixture.classlist);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.91', lp: '1.56' });
    const emails = await repo.findClasslistEmails(CourseId.of(101));
    expect(emails).toEqual(['alice@x.edu', 'bob@x.edu']);
  });
});
