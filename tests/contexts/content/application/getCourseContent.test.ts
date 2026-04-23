import { describe, it, expect } from 'vitest';
import { getCourseContent } from '@/contexts/content/application/getCourseContent';
import { Module } from '@/contexts/content/domain/Module';
import { Topic } from '@/contexts/content/domain/Topic';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

describe('getCourseContent', () => {
  it('returns the module tree', async () => {
    const topic = new Topic({ id: 1, title: 'Lecture 1', kind: 'file', url: null, fileExtension: 'pdf' });
    const mod = new Module({ id: 100, title: 'Week 1', topics: [topic], submodules: [] });
    const repo = new FakeContentRepository(new Map(), new Map([[101, [mod]]]));
    const out = await getCourseContent({ repo, courseId: OrgUnitId.of(101) });
    expect(out).toHaveLength(1);
    expect(out[0]?.topics[0]?.title).toBe('Lecture 1');
  });

  it('returns empty array when no modules', async () => {
    const repo = new FakeContentRepository();
    const out = await getCourseContent({ repo, courseId: OrgUnitId.of(101) });
    expect(out).toEqual([]);
  });
});
