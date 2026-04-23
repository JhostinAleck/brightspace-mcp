import type {
  CommunicationsRepository,
  MarkAnnouncementReadInput,
  PostReplyInput,
  PostReplyResult,
} from '@/contexts/communications/domain/CommunicationsRepository.js';
import { Announcement } from '@/contexts/communications/domain/Announcement.js';
import { DiscussionForum } from '@/contexts/communications/domain/DiscussionForum.js';
import { DiscussionTopic } from '@/contexts/communications/domain/DiscussionTopic.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { Cache } from '@/shared-kernel/cache/Cache.js';

export interface CachedCommunicationsRepositoryTtls {
  announcementsTtlMs: number;
  discussionsTtlMs: number;
}

const PREFIX = 'comms:';

interface AnnouncementPlain {
  id: number;
  courseOrgUnitId: number;
  title: string;
  html: string | null;
  authorName: string | null;
  postedAtIso: string;
}

interface TopicPlain {
  id: number;
  name: string;
  description: string | null;
  postCount: number;
  lastPostAtIso: string | null;
}

interface ForumPlain {
  id: number;
  name: string;
  topics: TopicPlain[];
}

function announcementToPlain(a: Announcement): AnnouncementPlain {
  return {
    id: a.id,
    courseOrgUnitId: a.courseOrgUnitId,
    title: a.title,
    html: a.html,
    authorName: a.authorName,
    postedAtIso: a.postedAt.toISOString(),
  };
}

function announcementFromPlain(p: AnnouncementPlain): Announcement {
  return new Announcement({
    id: p.id,
    courseOrgUnitId: p.courseOrgUnitId,
    title: p.title,
    html: p.html,
    authorName: p.authorName,
    postedAt: new Date(p.postedAtIso),
  });
}

function forumToPlain(f: DiscussionForum): ForumPlain {
  return {
    id: f.id,
    name: f.name,
    topics: f.topics.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      postCount: t.postCount,
      lastPostAtIso: t.lastPostAt ? t.lastPostAt.toISOString() : null,
    })),
  };
}

function forumFromPlain(p: ForumPlain): DiscussionForum {
  return new DiscussionForum({
    id: p.id,
    name: p.name,
    topics: p.topics.map(
      (tp) =>
        new DiscussionTopic({
          id: tp.id,
          name: tp.name,
          description: tp.description,
          postCount: tp.postCount,
          lastPostAt: tp.lastPostAtIso ? new Date(tp.lastPostAtIso) : null,
        }),
    ),
  });
}

export class CachedCommunicationsRepository implements CommunicationsRepository {
  constructor(
    private readonly inner: CommunicationsRepository,
    private readonly cache: Cache,
    private readonly ttls: CachedCommunicationsRepositoryTtls,
  ) {}

  async findAnnouncements(
    courseId: OrgUnitId,
    opts?: { limit?: number },
  ): Promise<Announcement[]> {
    const key = `${PREFIX}announcements:${OrgUnitId.toNumber(courseId)}`;
    const cached = await this.cache.get<AnnouncementPlain[]>(key);
    if (cached) {
      const restored = cached.map(announcementFromPlain);
      return opts?.limit ? restored.slice(0, opts.limit) : restored;
    }
    const fresh = await this.inner.findAnnouncements(courseId);
    await this.cache.set(key, fresh.map(announcementToPlain), this.ttls.announcementsTtlMs);
    return opts?.limit ? fresh.slice(0, opts.limit) : fresh;
  }

  async findDiscussions(courseId: OrgUnitId): Promise<DiscussionForum[]> {
    const key = `${PREFIX}discussions:${OrgUnitId.toNumber(courseId)}`;
    const cached = await this.cache.get<ForumPlain[]>(key);
    if (cached) return cached.map(forumFromPlain);
    const fresh = await this.inner.findDiscussions(courseId);
    await this.cache.set(key, fresh.map(forumToPlain), this.ttls.discussionsTtlMs);
    return fresh;
  }

  async postReply(input: PostReplyInput): Promise<PostReplyResult> {
    return this.inner.postReply(input);
  }

  async markAnnouncementRead(input: MarkAnnouncementReadInput): Promise<void> {
    return this.inner.markAnnouncementRead(input);
  }
}
