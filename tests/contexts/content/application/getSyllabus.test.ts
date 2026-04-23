import { describe, it, expect } from 'vitest';
import { getSyllabus } from '@/contexts/content/application/getSyllabus';
import { Syllabus } from '@/contexts/content/domain/Syllabus';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

describe('getSyllabus', () => {
  it('returns the syllabus when present', async () => {
    const syl = new Syllabus({ courseOrgUnitId: 101, title: 'Course Syllabus', html: '<p>Welcome</p>', updatedAt: null, sourceUrl: null });
    const repo = new FakeContentRepository(new Map([[101, syl]]));
    const out = await getSyllabus({ repo, courseId: OrgUnitId.of(101) });
    expect(out?.title).toBe('Course Syllabus');
  });

  it('returns null when absent', async () => {
    const repo = new FakeContentRepository();
    const out = await getSyllabus({ repo, courseId: OrgUnitId.of(101) });
    expect(out).toBeNull();
  });
});
