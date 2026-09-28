import { describe, expect, it, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';

import { handleGetCourseContent } from '@/mcp/tools/get-course-content.tool.js';
import { handleGetCourseFile } from '@/mcp/tools/get-course-file.tool.js';
import { handleGetModule } from '@/mcp/tools/get-module.tool.js';
import { handleSearchCourse } from '@/mcp/tools/search-course.tool.js';
import { D2lContentRepository } from '@/contexts/content/infrastructure/D2lContentRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { Module } from '@/contexts/content/domain/Module.js';
import { Topic } from '@/contexts/content/domain/Topic.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository.js';
import { buildPdf, warmPdfParser } from '@tests/helpers/zip.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

beforeAll(warmPdfParser, 60_000);

const BASE = 'https://school.test';
const COURSE = 101;
const toc = JSON.parse(readFileSync(resolve(__dirname, '../../fixtures/content/toc.json'), 'utf-8'));

/** Real repository over the sanitized TOC fixture, so tools see real-shaped data. */
function tocRepo(): D2lContentRepository {
  nock(BASE).get(`/d2l/api/le/1.99/${COURSE}/content/toc`).reply(200, toc);
  const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
  return new D2lContentRepository(client, { le: '1.99' });
}

const text = (r: { content: Array<{ type: string; text?: string }> }): string =>
  r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

describe('get_course_content with the TOC', () => {
  it('shows real topic kinds, broken topics, and module-description excerpts with their links', async () => {
    const r = await handleGetCourseContent({ contentRepo: tocRepo(), output: testOutputContext() }, { course_id: COURSE, depth: 3 });
    const out = text(r);
    expect(out).toContain('Welcome _[file]_ (id=9001)');
    expect(out).toContain('Clase grabada _[link]_ (id=9002) — https://www.youtube.com/watch?v=FAKEVIDEO');
    expect(out).toContain('_[quiz]_ (id=9003)');
    expect(out).toContain('_[lti]_ (id=9004)');
    expect(out).toMatch(/MS1-Optional\.pdf _\[file\]_ \(id=9012\) \[broken\]/);
    expect(out).not.toContain('[other]');
    // Description-only module (networks-course style): excerpt + link to the PDF, plus its id.
    expect(out).toContain('Capitulo 1 - Introduccion a las Redes** (module_id=911)');
    expect(out).toContain('Capítulo 1 - Introducción a las Redes: /content/enforced/101-202620_TEST1010_1/Capi%CC%81tulo%201.pdf');
    // Embedded video in <object>/<param>: the real path, without the misleading old-course label or session token.
    expect(out).toContain('/content/enforced/101-202620_TEST1010_1/Transporte%20-%20Diap%2001%20480p.mov');
    expect(out).not.toContain('999-OLDCOURSE');
    expect(out).not.toContain('d2lSessionVal');
    expect(out).toContain('Videos del capítulo 3 sobre TCP y UDP.');
    // Banner-only descriptions add nothing.
    expect(out).not.toContain('banner');
    expect(out).toContain('get_module');
    nock.cleanAll();
  });

  it('caps long description excerpts and link lists and points to get_module', async () => {
    const links = Array.from({ length: 12 }, (_, i) => `<a href="/content/enforced/101-X/f${i}.pdf">File ${i}</a>`).join(' ');
    const mod = new Module({ id: 5, title: 'Big', topics: [], submodules: [], descriptionHtml: `<p>${'lorem ipsum '.repeat(100)}</p>${links}` });
    const repo = new FakeContentRepository(new Map(), new Map([[COURSE, [mod]]]));
    const out = text(await handleGetCourseContent({ contentRepo: repo, output: testOutputContext() }, { course_id: COURSE }));
    expect(out).toContain('…');
    expect(out).not.toContain('lorem ipsum '.repeat(40));
    expect(out).toContain('File 0: /content/enforced/101-X/f0.pdf');
    expect(out).not.toContain('f11.pdf');
    expect(out).toMatch(/\+\d+ more/);
    expect(out).toContain('get_module(course_id=101, module_id=5)');
  });
});

describe('get_module', () => {
  it('returns the full description text, every link, topics and submodules', async () => {
    const r = await handleGetModule({ contentRepo: tocRepo() }, { course_id: COURSE, module_id: 912 });
    const out = text(r);
    expect(out).toContain('Capa de Transporte (videos)');
    expect(out).toContain('Videos del capítulo 3 sobre TCP y UDP.');
    expect(out).toContain('/content/enforced/101-202620_TEST1010_1/Transporte%20-%20Diap%2001%20480p.mov');
    expect(out).not.toContain('999-OLDCOURSE');
    expect(out).toContain('get_course_file');
    nock.cleanAll();
  });

  it('lists topics and submodules of a module', async () => {
    const r = await handleGetModule({ contentRepo: tocRepo() }, { course_id: COURSE, module_id: 900 });
    const out = text(r);
    expect(out).toContain('Clase grabada [link] (id=9002)');
    expect(out).toContain('Sprint 1 (module_id=901)');
    nock.cleanAll();
  });

  it('reports an unknown module', async () => {
    const r = await handleGetModule({ contentRepo: new FakeContentRepository() }, { course_id: COURSE, module_id: 1 });
    expect(text(r)).toMatch(/not found/i);
  });
});

describe('get_course_file', () => {
  it('downloads and extracts a /content/enforced file of the course', async () => {
    const repo = new FakeContentRepository();
    const spy = vi.spyOn(repo, 'findCourseFile').mockResolvedValue(buildPdf(['Programa del curso ISIS']));
    const r = await handleGetCourseFile({ contentRepo: repo }, { course_id: COURSE, path: '/content/enforced/101-X/Programa Curso.pdf' });
    expect(text(r)).toContain('Programa del curso ISIS');
    expect(spy.mock.calls[0]?.[1].path).toBe('/content/enforced/101-X/Programa%20Curso.pdf');
  });

  it('accepts full tenant URLs, rejects other hosts and other courses with isError', async () => {
    const repo = new FakeContentRepository();
    vi.spyOn(repo, 'findCourseFile').mockResolvedValue(Buffer.from('hola'));
    const ok = await handleGetCourseFile({ contentRepo: repo, baseUrl: BASE }, { course_id: COURSE, path: `${BASE}/content/enforced/101-X/a.txt` });
    expect(text(ok)).toContain('hola');

    const host = await handleGetCourseFile({ contentRepo: repo, baseUrl: BASE }, { course_id: COURSE, path: 'https://evil.test/content/enforced/101-X/a.txt' });
    expect(host.isError).toBe(true);
    const other = await handleGetCourseFile({ contentRepo: repo }, { course_id: COURSE, path: '/content/enforced/202-Y/a.txt' });
    expect(other.isError).toBe(true);
    const traversal = await handleGetCourseFile({ contentRepo: repo }, { course_id: COURSE, path: '/content/enforced/101-X/../../d2l/api/lp/1.0/users/whoami' });
    expect(traversal.isError).toBe(true);
  });

  it('resolves a relative link against the HTML topic it came from', async () => {
    const t = new Topic({ id: 7, title: 'Welcome', kind: 'file', url: '/content/enforced/101-X/Welcome/Welcome.html', fileExtension: 'html' });
    const repo = new FakeContentRepository(new Map(), new Map([[COURSE, [new Module({ id: 1, title: 'M', topics: [t], submodules: [] })]]]));
    const spy = vi.spyOn(repo, 'findCourseFile').mockResolvedValue(Buffer.from('x'));
    await handleGetCourseFile({ contentRepo: repo }, { course_id: COURSE, path: 'files/syllabus.pdf', topic_id: 7 });
    expect(spy.mock.calls[0]?.[1].path).toBe('/content/enforced/101-X/Welcome/files/syllabus.pdf');
  });

  it('flags an HTML (login/error) page served in place of a binary file', async () => {
    const repo = new FakeContentRepository();
    vi.spyOn(repo, 'findCourseFile').mockResolvedValue(Buffer.from('<!DOCTYPE html><html><body>Log in</body></html>'));
    const r = await handleGetCourseFile({ contentRepo: repo }, { course_id: COURSE, path: '/content/enforced/101-X/a.pdf' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/HTML page instead of the \.pdf file/);
  });

  it('turns a 404 into a readable message', async () => {
    const repo = new FakeContentRepository();
    vi.spyOn(repo, 'findCourseFile').mockRejectedValue(new D2lApiError(404, '/content/enforced/101-X/a.pdf', ''));
    const r = await handleGetCourseFile({ contentRepo: repo }, { course_id: COURSE, path: '/content/enforced/101-X/a.pdf' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not found/i);
  });
});

describe('search_course over module descriptions', () => {
  const comms = {
    findAnnouncements: async () => [],
    findDiscussions: async () => [],
  } as unknown as CommunicationsRepository;

  it('finds words that only appear in a module description', async () => {
    const r = await handleSearchCourse({ contentRepo: tocRepo(), communicationsRepo: comms }, { course_id: COURSE, query: 'UDP' });
    const out = text(r);
    expect(out).toContain('Capa de Transporte (videos)');
    expect(out).toContain('module_id=912');
    expect(out).toContain('TCP y UDP');
    expect(out).not.toContain('999-OLDCOURSE');
    nock.cleanAll();
  });
});
