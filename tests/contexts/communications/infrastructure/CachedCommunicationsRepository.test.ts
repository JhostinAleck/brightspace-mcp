import { describe, it, expect, vi } from 'vitest';
import { CachedCommunicationsRepository } from '@/contexts/communications/infrastructure/CachedCommunicationsRepository.js';
import { FakeCommunicationsRepository } from '@tests/helpers/fakes/FakeCommunicationsRepository.js';
import { Announcement } from '@/contexts/communications/domain/Announcement.js';
import { DiscussionForum } from '@/contexts/communications/domain/DiscussionForum.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

describe('CachedCommunicationsRepository', () => {
  it('caches announcements', async () => {
    const a = new Announcement({
      id: 1,
      courseOrgUnitId: 101,
      title: 'A',
      html: null,
      authorName: null,
      postedAt: new Date(),
    });
    const inner = new FakeCommunicationsRepository(new Map([[101, [a]]]));
    const spy = vi.spyOn(inner, 'findAnnouncements');
    const repo = new CachedCommunicationsRepository(inner, new InMemoryCache(), {
      announcementsTtlMs: 60_000,
      discussionsTtlMs: 60_000,
    });
    await repo.findAnnouncements(OrgUnitId.of(101));
    await repo.findAnnouncements(OrgUnitId.of(101));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps pinned and attachments through the cache and serves findAnnouncement from it', async () => {
    const a = new Announcement({
      id: 7, courseOrgUnitId: 101, title: 'A', html: '<p>x</p>', authorName: 'Instructor Two',
      postedAt: new Date('2026-04-20T12:00:00Z'), pinned: true,
      attachments: [{ id: 5, name: 'f.pdf', size: 10 }],
    });
    const inner = new FakeCommunicationsRepository(new Map([[101, [a]]]));
    const cache = new InMemoryCache();
    const ttls = { announcementsTtlMs: 60_000, discussionsTtlMs: 60_000 };
    await new CachedCommunicationsRepository(inner, cache, ttls).findAnnouncements(OrgUnitId.of(101));
    const spyOne = vi.spyOn(inner, 'findAnnouncement');
    const repo = new CachedCommunicationsRepository(inner, cache, ttls);
    const [restored] = await repo.findAnnouncements(OrgUnitId.of(101));
    expect(restored?.pinned).toBe(true);
    expect(restored?.attachments).toEqual([{ id: 5, name: 'f.pdf', size: 10 }]);
    expect((await repo.findAnnouncement(OrgUnitId.of(101), 7))?.authorName).toBe('Instructor Two');
    expect(spyOne).not.toHaveBeenCalled();
    expect(await repo.findAnnouncement(OrgUnitId.of(101), 8)).toBeNull();
    expect(spyOne).toHaveBeenCalledWith(OrgUnitId.of(101), 8);
  });

  it('caches discussions', async () => {
    const forum = new DiscussionForum({ id: 100, name: 'Main', topics: [] });
    const inner = new FakeCommunicationsRepository(new Map(), new Map([[101, [forum]]]));
    const spy = vi.spyOn(inner, 'findDiscussions');
    const repo = new CachedCommunicationsRepository(inner, new InMemoryCache(), {
      announcementsTtlMs: 60_000,
      discussionsTtlMs: 60_000,
    });
    await repo.findDiscussions(OrgUnitId.of(101));
    await repo.findDiscussions(OrgUnitId.of(101));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
