import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lCourseRepository } from '@/contexts/courses/infrastructure/D2lCourseRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';

const BASE = 'https://x.com';
const fixturePath = resolve(__dirname, '../../../fixtures/enrollments/happy-path.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

afterEach(() => nock.cleanAll());

describe('D2lCourseRepository.findMyCourses', () => {
  it('parses enrollments and returns Course[]', async () => {
    nock(BASE).get(/\/d2l\/api\/le\/1\.91\/enrollments\/myenrollments\/.*/).reply(200, fixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.91' });
    const courses = await repo.findMyCourses();
    expect(courses).toHaveLength(2);
    expect(courses[0]?.name).toBe('ECE 264');
    expect(courses[1]?.active).toBe(false);
  });

  it('filters by activeOnly', async () => {
    nock(BASE).get(/\/d2l\/api\/le\/1\.91\/enrollments\/myenrollments\/.*/).reply(200, fixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCourseRepository(client, { le: '1.91' });
    const courses = await repo.findMyCourses({ activeOnly: true });
    expect(courses).toHaveLength(1);
    expect(courses[0]?.name).toBe('ECE 264');
  });
});
