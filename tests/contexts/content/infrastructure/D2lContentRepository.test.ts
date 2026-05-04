import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lContentRepository } from '@/contexts/content/infrastructure/D2lContentRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

const BASE = 'https://x.com';
const syllabusFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/content/syllabus.json'), 'utf-8'),
);
const modulesFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/content/modules.json'), 'utf-8'),
);

afterEach(() => nock.cleanAll());

describe('D2lContentRepository', () => {
  it('findSyllabus returns the course overview HTML', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/overview').reply(200, syllabusFixture.overview);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lContentRepository(client, { le: '1.91' });
    const syl = await repo.findSyllabus(OrgUnitId.of(101));
    expect(syl?.html).toContain('Welcome to ECE 264');
  });

  it('findSyllabus returns null when no overview exists (404)', async () => {
    nock(BASE).get('/d2l/api/le/1.91/102/overview').reply(404, '');
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lContentRepository(client, { le: '1.91' });
    expect(await repo.findSyllabus(OrgUnitId.of(102))).toBeNull();
  });

  it('findModules builds the tree with topics', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/content/root/').reply(200, modulesFixture.root);
    nock(BASE)
      .get('/d2l/api/le/1.91/101/content/modules/500/structure/')
      .reply(200, modulesFixture.structure_500);
    nock(BASE)
      .get('/d2l/api/le/1.91/101/content/modules/501/structure/')
      .reply(200, modulesFixture.structure_501);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lContentRepository(client, { le: '1.91' });
    const modules = await repo.findModules(OrgUnitId.of(101));
    expect(modules).toHaveLength(2);
    expect(modules[0]?.title).toBe('Week 1');
    expect(modules[0]?.topics).toHaveLength(2);
    expect(modules[0]?.topics[0]?.kind).toBe('file');
    expect(modules[0]?.topics[1]?.kind).toBe('quiz');
  });

  it('findTopicFile returns the raw binary buffer', async () => {
    const body = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    nock(BASE).get('/d2l/api/le/1.91/101/content/topics/42/file').reply(200, body);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lContentRepository(client, { le: '1.91' });
    const buf = await repo.findTopicFile(OrgUnitId.of(101), 42);
    expect(buf[0]).toBe(0x25);
  });

  it('findTopicRenderedText returns rendered text via getRenderedText', async () => {
    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
      pageRenderer: {
        getRenderedHtml: async () => '<html><body>Course program text</body></html>',
        getRenderedText: async () => 'Course program text',
      } as never,
    });
    const repo = new D2lContentRepository(client, { le: '1.91' });
    const text = await repo.findTopicRenderedText(OrgUnitId.of(101), 42);
    expect(text).toBe('Course program text');
  });
});
