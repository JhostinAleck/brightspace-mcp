import type {
  CommunicationsRepository,
  MarkAnnouncementReadInput,
  PostReplyInput,
  PostReplyResult,
} from '@/contexts/communications/domain/CommunicationsRepository.js';
import { Announcement } from '@/contexts/communications/domain/Announcement.js';
import { DiscussionForum } from '@/contexts/communications/domain/DiscussionForum.js';
import { DiscussionTopic } from '@/contexts/communications/domain/DiscussionTopic.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

interface AnnouncementDto {
  Id: number;
  Title: string;
  Body?: { Html?: string | null; Text?: string | null } | null;
  Author?: { DisplayName?: string | null } | null;
  StartDate: string;
}

interface ForumDto {
  ForumId: number;
  Name: string;
}

interface TopicDto {
  TopicId: number;
  Name: string;
  Description?: { Text?: string | null; Html?: string | null } | null;
  TotalPostCount?: number | null;
  LastPostDate?: string | null;
}

export interface D2lCommunicationsRepositoryOptions {
  le: string;
}

export class D2lCommunicationsRepository implements CommunicationsRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lCommunicationsRepositoryOptions,
  ) {}

  async findAnnouncements(courseId: OrgUnitId): Promise<Announcement[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const dtos = await this.client.get<AnnouncementDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/news/`,
    );
    return dtos.map(
      (dto) =>
        new Announcement({
          id: dto.Id,
          courseOrgUnitId: orgUnit,
          title: dto.Title,
          html: dto.Body?.Html ?? dto.Body?.Text ?? null,
          authorName: dto.Author?.DisplayName ?? null,
          postedAt: new Date(dto.StartDate),
        }),
    );
  }

  async findDiscussions(courseId: OrgUnitId): Promise<DiscussionForum[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const forums = await this.client.get<ForumDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/discussions/forums/`,
    );
    return Promise.all(
      forums.map(async (f) => {
        const topics = await this.client.get<TopicDto[]>(
          `/d2l/api/le/${this.versions.le}/${orgUnit}/discussions/forums/${f.ForumId}/topics/`,
        );
        return new DiscussionForum({
          id: f.ForumId,
          name: f.Name,
          topics: topics.map(
            (t) =>
              new DiscussionTopic({
                id: t.TopicId,
                name: t.Name,
                description: t.Description?.Text ?? null,
                postCount: t.TotalPostCount ?? 0,
                lastPostAt: t.LastPostDate ? new Date(t.LastPostDate) : null,
              }),
          ),
        });
      }),
    );
  }

  async postReply(input: PostReplyInput): Promise<PostReplyResult> {
    const orgUnit = String(input.courseId);
    const path = `/d2l/api/le/${this.versions.le}/${orgUnit}/discussions/forums/${input.forumId}/topics/${input.topicId}/posts/`;
    const response = await this.client.postJson<{ Id: number; DatePosted: string }>(path, {
      ParentPostId: null,
      Subject: null,
      Message: { Html: input.body, Text: input.body },
    });
    return {
      postId: String(response.Id),
      postedAt: new Date(response.DatePosted),
    };
  }

  async markAnnouncementRead(input: MarkAnnouncementReadInput): Promise<void> {
    const orgUnit = String(input.courseId);
    const path = `/d2l/api/le/${this.versions.le}/${orgUnit}/news/${input.announcementId}/mark-read`;
    await this.client.postJson(path, {});
  }
}
