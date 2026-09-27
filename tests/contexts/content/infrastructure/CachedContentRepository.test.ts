import { describe, it, expect, vi } from 'vitest';
import { CachedContentRepository } from '@/contexts/content/infrastructure/CachedContentRepository';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';
import { Syllabus } from '@/contexts/content/domain/Syllabus';
import { Module } from '@/contexts/content/domain/Module';
import { Topic } from '@/contexts/content/domain/Topic';
import { CourseFilePath } from '@/contexts/content/domain/CourseFilePath';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

describe('CachedContentRepository', () => {
  it('caches findSyllabus results', async () => {
    const syl = new Syllabus({ courseOrgUnitId: 101, title: 'S', html: '<p>x</p>', updatedAt: null, sourceUrl: null });
    const inner = new FakeContentRepository(new Map([[101, syl]]));
    const spy = vi.spyOn(inner, 'findSyllabus');
    const repo = new CachedContentRepository(inner, new InMemoryCache(), { syllabusTtlMs: 60_000, modulesTtlMs: 60_000 });
    await repo.findSyllabus(OrgUnitId.of(101));
    await repo.findSyllabus(OrgUnitId.of(101));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches findModules results', async () => {
    const mod = new Module({ id: 100, title: 'Week 1', topics: [], submodules: [] });
    const inner = new FakeContentRepository(new Map(), new Map([[101, [mod]]]));
    const spy = vi.spyOn(inner, 'findModules');
    const repo = new CachedContentRepository(inner, new InMemoryCache(), { syllabusTtlMs: 60_000, modulesTtlMs: 60_000 });
    await repo.findModules(OrgUnitId.of(101));
    await repo.findModules(OrgUnitId.of(101));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches null syllabus (distinguishes from cache miss)', async () => {
    const inner = new FakeContentRepository();
    const spy = vi.spyOn(inner, 'findSyllabus');
    const repo = new CachedContentRepository(inner, new InMemoryCache(), { syllabusTtlMs: 60_000, modulesTtlMs: 60_000 });
    await repo.findSyllabus(OrgUnitId.of(999));
    await repo.findSyllabus(OrgUnitId.of(999));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('round-trips module descriptions, lti kind and broken flags through the cache', async () => {
    const topic = new Topic({ id: 1, title: 'LTI', kind: 'lti', url: '/d2l/x', fileExtension: null, isBroken: true });
    const mod = new Module({ id: 100, title: 'W1', topics: [topic], submodules: [], descriptionHtml: '<p>desc</p>' });
    const inner = new FakeContentRepository(new Map(), new Map([[101, [mod]]]));
    const repo = new CachedContentRepository(inner, new InMemoryCache(), { syllabusTtlMs: 60_000, modulesTtlMs: 60_000 });
    await repo.findModules(OrgUnitId.of(101));
    const [cached] = await repo.findModules(OrgUnitId.of(101));
    expect(cached?.descriptionHtml).toBe('<p>desc</p>');
    expect(cached?.topics[0]?.kind).toBe('lti');
    expect(cached?.topics[0]?.isBroken).toBe(true);
  });

  it('passes findCourseFile through uncached', async () => {
    const inner = new FakeContentRepository();
    const spy = vi.spyOn(inner, 'findCourseFile').mockResolvedValue(Buffer.from('x'));
    const repo = new CachedContentRepository(inner, new InMemoryCache(), { syllabusTtlMs: 60_000, modulesTtlMs: 60_000 });
    const path = CourseFilePath.parse('/content/enforced/101-X/a.pdf', 101);
    await repo.findCourseFile(OrgUnitId.of(101), path);
    await repo.findCourseFile(OrgUnitId.of(101), path);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
