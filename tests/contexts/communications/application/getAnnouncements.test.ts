import { describe, it, expect } from 'vitest';
import { getAnnouncements } from '@/contexts/communications/application/getAnnouncements';
import { Announcement } from '@/contexts/communications/domain/Announcement';
import { FakeCommunicationsRepository } from '@tests/helpers/fakes/FakeCommunicationsRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

describe('getAnnouncements', () => {
  it('returns announcements sorted by postedAt desc', async () => {
    const newer = new Announcement({ id: 2, courseOrgUnitId: 101, title: 'New', html: null, authorName: null, postedAt: new Date('2026-04-20') });
    const older = new Announcement({ id: 1, courseOrgUnitId: 101, title: 'Old', html: null, authorName: null, postedAt: new Date('2026-01-10') });
    const repo = new FakeCommunicationsRepository(new Map([[101, [older, newer]]]));
    const out = await getAnnouncements({ repo, courseId: OrgUnitId.of(101) });
    expect(out.map((a) => a.title)).toEqual(['New', 'Old']);
  });

  it('respects limit', async () => {
    const a1 = new Announcement({ id: 1, courseOrgUnitId: 101, title: 'A', html: null, authorName: null, postedAt: new Date('2026-04-20') });
    const a2 = new Announcement({ id: 2, courseOrgUnitId: 101, title: 'B', html: null, authorName: null, postedAt: new Date('2026-04-19') });
    const repo = new FakeCommunicationsRepository(new Map([[101, [a1, a2]]]));
    const out = await getAnnouncements({ repo, courseId: OrgUnitId.of(101), limit: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('A');
  });

  it('puts pinned announcements first', async () => {
    const pinnedOld = new Announcement({ id: 1, courseOrgUnitId: 101, title: 'Pinned', html: null, authorName: null, postedAt: new Date('2026-01-10'), pinned: true });
    const newer = new Announcement({ id: 2, courseOrgUnitId: 101, title: 'New', html: null, authorName: null, postedAt: new Date('2026-04-20') });
    const repo = new FakeCommunicationsRepository(new Map([[101, [newer, pinnedOld]]]));
    const out = await getAnnouncements({ repo, courseId: OrgUnitId.of(101) });
    expect(out.map((a) => a.title)).toEqual(['Pinned', 'New']);
  });
});
