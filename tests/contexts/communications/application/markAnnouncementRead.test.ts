import { describe, expect, it } from 'vitest';

import { markAnnouncementRead } from '@/contexts/communications/application/markAnnouncementRead.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';

describe('markAnnouncementRead', () => {
  it('calls repository.markAnnouncementRead with the ids', async () => {
    const calls: Array<{ courseId: string; announcementId: string }> = [];
    const repo: CommunicationsRepository = {
      findAnnouncements: async () => [],
      findDiscussions: async () => [],
      postReply: async () => ({ postId: 'x', postedAt: new Date() }),
      markAnnouncementRead: async (input) => {
        calls.push({
          courseId: String(input.courseId),
          announcementId: input.announcementId,
        });
      },
    };
    await markAnnouncementRead({ repo, courseId: 'c1', announcementId: 'a1' });
    expect(calls).toEqual([{ courseId: 'c1', announcementId: 'a1' }]);
  });

  it('rejects empty announcementId', async () => {
    const repo: CommunicationsRepository = {
      findAnnouncements: async () => [],
      findDiscussions: async () => [],
      postReply: async () => ({ postId: 'x', postedAt: new Date() }),
      markAnnouncementRead: async () => {},
    };
    await expect(
      markAnnouncementRead({ repo, courseId: 'c1', announcementId: '' }),
    ).rejects.toThrow(/announcementId/i);
  });
});
