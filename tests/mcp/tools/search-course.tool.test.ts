import { describe, expect, it } from 'vitest';

import { handleSearchCourse } from '@/mcp/tools/search-course.tool.js';
import { Module } from '@/contexts/content/domain/Module.js';
import { Topic } from '@/contexts/content/domain/Topic.js';
import { Announcement } from '@/contexts/communications/domain/Announcement.js';
import { DiscussionForum } from '@/contexts/communications/domain/DiscussionForum.js';
import { DiscussionTopic } from '@/contexts/communications/domain/DiscussionTopic.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';

const fakeContent: ContentRepository = {
  findModules: async () => [
    new Module({
      id: 1, title: 'BGP routing',
      topics: [new Topic({ id: 10, title: 'AS_PATH attribute', moduleId: 1, fileExtension: '.pdf' })],
      submodules: [],
    }),
  ],
  findSyllabus: async () => null,
  findTopicFile: async () => Buffer.from(''),
  findTopicRenderedText: async () => null,
};

const fakeComms: CommunicationsRepository = {
  findAnnouncements: async () => [
    new Announcement({
      id: 1, courseOrgUnitId: 100, title: 'Reminder about BGP',
      html: '<p>Read chapter 4 on BGP</p>', authorName: 'Prof', postedAt: new Date(),
    }),
  ],
  findDiscussions: async () => [
    new DiscussionForum({
      id: 1, courseOrgUnitId: 100, name: 'General',
      topics: [new DiscussionTopic({
        id: 5, name: 'OSPF vs BGP',
        description: 'When to use OSPF and when BGP', totalPostCount: 0, lastPostDate: null,
      })],
    }),
  ],
  postReply: async () => { throw new Error('not used'); },
  markAnnouncementRead: async () => { throw new Error('not used'); },
};

describe('handleSearchCourse', () => {
  it('finds matches across content, announcements, and discussions', async () => {
    const result = await handleSearchCourse(
      { contentRepo: fakeContent, communicationsRepo: fakeComms },
      { course_id: 100, query: 'BGP' },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('BGP routing');
    expect(text).toContain('Reminder about BGP');
    expect(text).toContain('OSPF vs BGP');
    expect(text).toContain('[content]');
    expect(text).toContain('[announcements]');
    expect(text).toContain('[discussions]');
  });

  it('reports no matches when query has none', async () => {
    const result = await handleSearchCourse(
      { contentRepo: fakeContent, communicationsRepo: fakeComms },
      { course_id: 100, query: 'kubernetes' },
    );
    expect(result.content[0]?.text).toContain('No matches');
  });

  it('respects scope filter', async () => {
    const result = await handleSearchCourse(
      { contentRepo: fakeContent, communicationsRepo: fakeComms },
      { course_id: 100, query: 'BGP', scope: ['announcements'] },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Reminder about BGP');
    expect(text).not.toContain('AS_PATH');
  });
});
