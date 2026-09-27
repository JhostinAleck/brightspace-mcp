import { describe, it, expect } from 'vitest';
import { getSyllabus } from '@/contexts/content/application/getSyllabus';
import { Syllabus } from '@/contexts/content/domain/Syllabus';
import { Module } from '@/contexts/content/domain/Module';
import { Topic } from '@/contexts/content/domain/Topic';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const DIR = '/content/enforced/101-202620_ABCD1234_1';
const welcomeTopic = new Topic({ id: 10, title: 'Welcome', kind: 'file', url: `${DIR}/Welcome.html`, fileExtension: 'html' });
const slides = new Topic({ id: 11, title: 'Slides 1', kind: 'file', url: `${DIR}/slides1.pdf`, fileExtension: 'pdf' });
const tree = [
  new Module({ id: 1, title: 'Welcome', topics: [welcomeTopic], submodules: [] }),
  new Module({ id: 2, title: 'Slides', topics: [slides], submodules: [] }),
];
const welcomeHtml = Buffer.from(
  `\uFEFF<html><body><a href="https://school.example${DIR}/Welcome/ABCD1234-syllabus.pdf?isCourseFile=true">CHECK THE SYLLABUS HERE</a></body></html>`,
);

describe('getSyllabus', () => {
  it('returns the published overview without touching course content', async () => {
    const syl = new Syllabus({ courseOrgUnitId: 101, title: 'Course Syllabus', html: '<p>Welcome</p>', updatedAt: null, sourceUrl: null });
    const repo = new FakeContentRepository(new Map([[101, syl]]), new Map([[101, tree]]));
    const out = await getSyllabus({ repo, courseId: OrgUnitId.of(101) });
    expect(out.status).toBe('published');
    if (out.status === 'published') expect(out.syllabus.title).toBe('Course Syllabus');
    expect(repo.topicFileRequests).toEqual([]);
  });

  it('treats a blank overview as not published', async () => {
    const syl = new Syllabus({ courseOrgUnitId: 101, title: 'Course Syllabus', html: '  ', updatedAt: null, sourceUrl: null });
    const repo = new FakeContentRepository(new Map([[101, syl]]));
    const out = await getSyllabus({ repo, courseId: OrgUnitId.of(101) });
    expect(out).toEqual({ status: 'not_published', reason: 'empty', candidates: [], contentSearched: true });
  });

  it('reports not_found when the course has no overview at all', async () => {
    const repo = new FakeContentRepository(new Map(), new Map([[101, []]]));
    const out = await getSyllabus({ repo, courseId: OrgUnitId.of(101) });
    expect(out.status === 'not_published' && out.reason).toBe('not_found');
  });

  it('searches course content (scanning the intro page) when there is no overview', async () => {
    const repo = new FakeContentRepository(new Map(), new Map([[101, tree]]), new Map([[10, welcomeHtml]]));
    const out = await getSyllabus({ repo, courseId: OrgUnitId.of(101) });
    expect(out.status).toBe('not_published');
    if (out.status !== 'not_published') return;
    expect(out.contentSearched).toBe(true);
    expect(repo.topicFileRequests).toEqual([10]);
    expect(out.candidates[0]?.target).toEqual({ type: 'course_file', path: `${DIR}/Welcome/ABCD1234-syllabus.pdf` });
    expect(out.candidates[1]?.target).toEqual({ type: 'topic', topicId: 10 });
  });

  it('still ranks the tree when an intro page cannot be downloaded', async () => {
    const repo = new FakeContentRepository(new Map(), new Map([[101, tree]]));
    repo.findTopicFile = async () => {
      throw new Error('boom');
    };
    const out = await getSyllabus({ repo, courseId: OrgUnitId.of(101) });
    expect(out.status === 'not_published' && out.candidates.map((c) => c.target)).toEqual([{ type: 'topic', topicId: 10 }]);
  });

  it('reports that content could not be searched when the tree fails to load', async () => {
    const repo = new FakeContentRepository();
    repo.findModules = async () => {
      throw new Error('403');
    };
    const out = await getSyllabus({ repo, courseId: OrgUnitId.of(101) });
    expect(out).toEqual({ status: 'not_published', reason: 'not_found', candidates: [], contentSearched: false });
  });
});
