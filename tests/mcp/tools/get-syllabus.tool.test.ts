import { afterEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';

import { handleGetSyllabus } from '@/mcp/tools/get-syllabus.tool';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';
import { Syllabus } from '@/contexts/content/domain/Syllabus';
import { D2lContentRepository } from '@/contexts/content/infrastructure/D2lContentRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

const BASE = 'https://school.brightspace.test';
const FIXTURES = resolve(__dirname, '../../fixtures/content');
const toc = JSON.parse(readFileSync(resolve(FIXTURES, 'syllabus-toc.json'), 'utf-8'));
const welcomeHtml = readFileSync(resolve(FIXTURES, 'syllabus-welcome.html'));

afterEach(() => nock.cleanAll());

describe('get_syllabus tool', () => {
  it('strips HTML and formats syllabus text', async () => {
    const syl = new Syllabus({ courseOrgUnitId: 101, title: 'ECE 264 Syllabus', html: '<p>Welcome <b>class</b></p>', updatedAt: null, sourceUrl: null });
    const repo = new FakeContentRepository(new Map([[101, syl]]));
    const r = await handleGetSyllabus({ contentRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('Welcome class');
    expect(r.content[0]?.text).not.toContain('<');
  });

  it('says the overview is not published and suggests searching when content has no candidates', async () => {
    const repo = new FakeContentRepository();
    const r = await handleGetSyllabus({ contentRepo: repo, output: testOutputContext() }, { course_id: 101 });
    const text = r.content[0]?.text ?? '';
    expect(text).toMatch(/course overview not published/i);
    expect(text).toContain('search_course(course_id=101, query="syllabus")');
    expect(text).toContain('get_course_content(course_id=101)');
  });

  it('says so when course content could not be loaded', async () => {
    const repo = new FakeContentRepository();
    repo.findModules = async () => {
      throw new Error('forbidden');
    };
    const r = await handleGetSyllabus({ contentRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toMatch(/could not be loaded/i);
  });

  it('points at the syllabus inside course content when /overview is 404 (real D2L shapes)', async () => {
    const scope = nock(BASE)
      .get('/d2l/api/le/1.99/101/overview').reply(404, '')
      .get('/d2l/api/le/1.99/101/content/toc').reply(200, toc)
      .get('/d2l/api/le/1.99/101/content/topics/9001/file').reply(200, welcomeHtml, { 'Content-Type': 'text/html' });
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const contentRepo = new D2lContentRepository(client, { le: '1.99' });

    const r = await handleGetSyllabus({ contentRepo, output: testOutputContext() }, { course_id: 101 });
    const text = r.content[0]?.text ?? '';
    expect(scope.isDone()).toBe(true);
    expect(text).toMatch(/course overview not published \(404\)/i);
    expect(text).not.toMatch(/empty/i);

    const syllabusCall =
      'get_course_file(course_id=101, path="/content/enforced/101-202620_TEST1010_1/1_RECURSOS_DE_CONTENIDO/Welcome/TEST1010-syllabus.pdf")';
    const programaCall = 'get_course_file(course_id=101, path="/content/enforced/101-202620_TEST1010_1/TEST-1010-2026-20_Rev.pdf")';
    const welcomeCall = 'get_topic_file(course_id=101, topic_id=9001)';
    expect(text).toContain(syllabusCall);
    expect(text).toContain('¡¡ CHECK THE SYLLABUS HERE !!');
    expect(text).toContain(programaCall);
    expect(text).toContain(welcomeCall);
    // Best first: file name match > link text match > generic welcome page.
    expect(text.indexOf(syllabusCall)).toBeLessThan(text.indexOf(programaCall));
    expect(text.indexOf(programaCall)).toBeLessThan(text.indexOf(welcomeCall));
    expect(text).not.toContain('meet.example.test');
    expect(text).not.toContain('Kickoff');
  });

  it('renders module and external-link candidates with their next step', async () => {
    const { Module } = await import('@/contexts/content/domain/Module');
    const { Topic } = await import('@/contexts/content/domain/Topic');
    const page = new Topic({ id: 5, title: 'Bienvenida', kind: 'file', url: '/content/enforced/101-X/b.html', fileExtension: 'html' });
    const tree = [
      new Module({ id: 1, title: 'Presentación', topics: [page], submodules: [] }),
      new Module({ id: 2, title: 'Información general', topics: [], submodules: [] }),
    ];
    const html = Buffer.from('<a href="https://sharepoint.example.test/doc?e=1">Programa del curso</a>');
    const repo = new FakeContentRepository(new Map(), new Map([[101, tree]]), new Map([[5, html]]));
    const r = await handleGetSyllabus({ contentRepo: repo, output: testOutputContext() }, { course_id: 101 });
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('https://sharepoint.example.test/doc?e=1');
    expect(text).toMatch(/external/i);
    expect(text).toContain('get_topic_file(course_id=101, topic_id=5)');
    expect(text).toContain('get_module(course_id=101, module_id=2)');
  });
});
