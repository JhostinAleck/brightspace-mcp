import { describe, expect, it, vi, beforeAll } from 'vitest';
import { warmPdfParser } from '@tests/helpers/zip';

import { readTopic } from '@/contexts/content/application/readTopic.js';
import { getCourseFile } from '@/contexts/content/application/getCourseFile.js';
import { getModule } from '@/contexts/content/application/getModule.js';
import { InvalidCourseFilePathError } from '@/contexts/content/domain/CourseFilePath.js';
import { Module } from '@/contexts/content/domain/Module.js';
import { Topic, type TopicProps } from '@/contexts/content/domain/Topic.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository.js';

beforeAll(warmPdfParser, 60_000);

const COURSE = 101;
const t = (p: Partial<TopicProps> & { id: number }): Topic =>
  new Topic({ title: `T${p.id}`, kind: 'file', url: null, fileExtension: null, ...p });

function repoWith(topics: Topic[]): FakeContentRepository {
  const mod = new Module({ id: 1, title: 'M', topics, submodules: [
    new Module({ id: 2, title: 'Sub', topics: [], submodules: [], descriptionHtml: '<p>d</p>' }),
  ] });
  return new FakeContentRepository(new Map(), new Map([[COURSE, [mod]]]));
}

describe('readTopic', () => {
  it('downloads file topics and passes the topic URL as filename hint', async () => {
    const repo = repoWith([t({ id: 5, url: '/content/enforced/101-X/a.pdf', fileExtension: 'pdf' })]);
    const spy = vi.spyOn(repo, 'findTopicFile').mockResolvedValue(Buffer.from('%PDF'));
    const r = await readTopic({ repo, courseId: OrgUnitId.of(COURSE), topicId: 5 });
    expect(spy).toHaveBeenCalledWith(OrgUnitId.of(COURSE), 5);
    expect(r).toMatchObject({ status: 'file', filename: '/content/enforced/101-X/a.pdf' });
  });

  it('does not request /file for links, quizzes or LTI topics', async () => {
    const repo = repoWith([
      t({ id: 6, kind: 'link', url: 'https://youtu.be/x' }),
      t({ id: 7, kind: 'quiz', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?type=quiz' }),
      t({ id: 8, kind: 'lti', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?type=lti' }),
    ]);
    const spy = vi.spyOn(repo, 'findTopicFile');
    for (const id of [6, 7, 8]) {
      const r = await readTopic({ repo, courseId: OrgUnitId.of(COURSE), topicId: id });
      expect(r.status).toBe('not_downloadable');
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports broken topics without downloading', async () => {
    const repo = repoWith([t({ id: 9, isBroken: true })]);
    const spy = vi.spyOn(repo, 'findTopicFile');
    const r = await readTopic({ repo, courseId: OrgUnitId.of(COURSE), topicId: 9 });
    expect(r.status).toBe('broken');
    expect(spy).not.toHaveBeenCalled();
  });

  it('still tries the download when the topic is not in the tree', async () => {
    const repo = repoWith([]);
    vi.spyOn(repo, 'findTopicFile').mockResolvedValue(Buffer.from('x'));
    const r = await readTopic({ repo, courseId: OrgUnitId.of(COURSE), topicId: 77 });
    expect(r).toMatchObject({ status: 'file', topic: null, filename: null });
  });

  it('still tries the download when the tree cannot be loaded', async () => {
    const repo = repoWith([]);
    vi.spyOn(repo, 'findModules').mockRejectedValue(new Error('boom'));
    vi.spyOn(repo, 'findTopicFile').mockResolvedValue(Buffer.from('x'));
    const r = await readTopic({ repo, courseId: OrgUnitId.of(COURSE), topicId: 77 });
    expect(r.status).toBe('file');
  });
});

describe('getCourseFile', () => {
  it('downloads an absolute course path', async () => {
    const repo = repoWith([]);
    const spy = vi.spyOn(repo, 'findCourseFile').mockResolvedValue(Buffer.from('%PDF'));
    const r = await getCourseFile({ repo, courseId: OrgUnitId.of(COURSE), rawPath: '/content/enforced/101-X/Programa Curso.pdf' });
    expect(r.path.path).toBe('/content/enforced/101-X/Programa%20Curso.pdf');
    expect(spy.mock.calls[0]?.[1].path).toBe('/content/enforced/101-X/Programa%20Curso.pdf');
  });

  it('resolves a relative link against the directory of the HTML topic it came from', async () => {
    const repo = repoWith([t({ id: 5, url: '/content/enforced/101-X/1_RECURSOS/Welcome/Welcome.html', fileExtension: 'html' })]);
    vi.spyOn(repo, 'findCourseFile').mockResolvedValue(Buffer.from('x'));
    const r = await getCourseFile({ repo, courseId: OrgUnitId.of(COURSE), rawPath: 'files/syllabus.pdf', topicId: 5 });
    expect(r.path.path).toBe('/content/enforced/101-X/1_RECURSOS/Welcome/files/syllabus.pdf');
  });

  it('rejects a relative path that escapes the course even after resolution', async () => {
    const repo = repoWith([t({ id: 5, url: '/content/enforced/101-X/Welcome.html' })]);
    await expect(getCourseFile({ repo, courseId: OrgUnitId.of(COURSE), rawPath: '../../../d2l/api/x', topicId: 5 }))
      .rejects.toBeInstanceOf(InvalidCourseFilePathError);
  });

  it('rejects a relative path without a topic to resolve against', async () => {
    await expect(getCourseFile({ repo: repoWith([]), courseId: OrgUnitId.of(COURSE), rawPath: 'files/a.pdf' }))
      .rejects.toBeInstanceOf(InvalidCourseFilePathError);
  });

  it('rejects other courses and foreign hosts', async () => {
    const repo = repoWith([]);
    await expect(getCourseFile({ repo, courseId: OrgUnitId.of(COURSE), rawPath: '/content/enforced/202-Y/a.pdf' }))
      .rejects.toBeInstanceOf(InvalidCourseFilePathError);
    await expect(getCourseFile({ repo, courseId: OrgUnitId.of(COURSE), rawPath: 'https://evil.test/content/enforced/101-X/a.pdf', origin: 'https://school.test' }))
      .rejects.toBeInstanceOf(InvalidCourseFilePathError);
  });

  it('accepts a full URL on the tenant origin', async () => {
    const repo = repoWith([]);
    vi.spyOn(repo, 'findCourseFile').mockResolvedValue(Buffer.from('x'));
    const r = await getCourseFile({ repo, courseId: OrgUnitId.of(COURSE), rawPath: 'https://school.test/content/enforced/101-X/a.pdf?isCourseFile=true', origin: 'https://school.test' });
    expect(r.path.path).toBe('/content/enforced/101-X/a.pdf');
  });
});

describe('getModule', () => {
  it('finds nested modules by id', async () => {
    const m = await getModule({ repo: repoWith([]), courseId: OrgUnitId.of(COURSE), moduleId: 2 });
    expect(m?.descriptionHtml).toBe('<p>d</p>');
    expect(await getModule({ repo: repoWith([]), courseId: OrgUnitId.of(COURSE), moduleId: 99 })).toBeNull();
  });
});
