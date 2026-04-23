import { describe, expect, it } from 'vitest';

import { postDiscussionReply } from '@/contexts/communications/application/postDiscussionReply.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';

function makeRepo(captured: { replies: unknown[] }): CommunicationsRepository {
  return {
    findAnnouncements: async () => [],
    findDiscussions: async () => [],
    postReply: async (input) => {
      captured.replies.push(input);
      return { postId: 'p-1', postedAt: new Date('2026-04-23') };
    },
    markAnnouncementRead: async () => {},
  };
}

describe('postDiscussionReply', () => {
  it('delegates to repository with trimmed body', async () => {
    const captured = { replies: [] as unknown[] };
    const repo = makeRepo(captured);
    const result = await postDiscussionReply({
      repo,
      courseId: 'c1',
      forumId: 'forum-1',
      topicId: 'topic-1',
      body: '  hello  ',
    });
    expect(result.postId).toBe('p-1');
    const captured0 = captured.replies[0] as { body: string };
    expect(captured0.body).toBe('hello');
  });

  it('rejects empty body', async () => {
    const captured = { replies: [] as unknown[] };
    const repo = makeRepo(captured);
    await expect(
      postDiscussionReply({ repo, courseId: 'c1', forumId: 'f', topicId: 't', body: '   ' }),
    ).rejects.toThrow(/body/i);
  });

  it('rejects body exceeding 10000 chars', async () => {
    const captured = { replies: [] as unknown[] };
    const repo = makeRepo(captured);
    const tooLong = 'a'.repeat(10_001);
    await expect(
      postDiscussionReply({ repo, courseId: 'c1', forumId: 'f', topicId: 't', body: tooLong }),
    ).rejects.toThrow(/too long/i);
  });
});
