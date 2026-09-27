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
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

/** GET /d2l/api/le/{v}/{ou}/news/ item (fields we use). */
interface AnnouncementDto {
  Id: number;
  Title: string;
  Body?: { Html?: string | null; Text?: string | null } | null;
  /** User id of the author; null when the author is not shown. */
  CreatedBy?: number | null;
  IsAuthorInfoShown?: boolean;
  StartDate: string;
  IsHidden?: boolean;
  IsPublished?: boolean;
  IsPinned?: boolean;
  PinnedDate?: string | null;
  Attachments?: Array<{ FileId: number; FileName: string; Size: number }> | null;
}

interface ClasslistUserDto {
  Identifier: string;
  DisplayName?: string | null;
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

function isVisible(dto: AnnouncementDto): boolean {
  return dto.IsHidden !== true && dto.IsPublished !== false;
}

function authorIdOf(dto: AnnouncementDto): string | null {
  if (dto.IsAuthorInfoShown === false || dto.CreatedBy === null || dto.CreatedBy === undefined) return null;
  return String(dto.CreatedBy);
}

function toAnnouncement(dto: AnnouncementDto, orgUnit: number, names: Map<string, string>): Announcement {
  const authorId = authorIdOf(dto);
  return new Announcement({
    id: dto.Id,
    courseOrgUnitId: orgUnit,
    title: dto.Title,
    html: dto.Body?.Html || dto.Body?.Text || null,
    authorName: authorId !== null ? (names.get(authorId) ?? null) : null,
    postedAt: new Date(dto.StartDate),
    pinned: dto.IsPinned === true || Boolean(dto.PinnedDate),
    attachments: (dto.Attachments ?? []).map((a) => ({ id: a.FileId, name: a.FileName, size: a.Size })),
  });
}

export interface D2lCommunicationsRepositoryOptions {
  le: string;
}

export class D2lCommunicationsRepository implements CommunicationsRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lCommunicationsRepositoryOptions,
  ) {}

  /** Per-course user id → display name, from the classlist (students may read it). */
  private readonly authorNames = new Map<number, Promise<Map<string, string>>>();

  async findAnnouncements(courseId: OrgUnitId): Promise<Announcement[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    // The route returns every item in one response (no paging).
    const dtos = await this.client.get<AnnouncementDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/news/`,
    );
    const visible = dtos.filter(isVisible);
    const names = await this.authorNamesFor(orgUnit, visible);
    return visible.map((dto) => toAnnouncement(dto, orgUnit, names));
  }

  async findAnnouncement(courseId: OrgUnitId, announcementId: number): Promise<Announcement | null> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    let dto: AnnouncementDto;
    try {
      dto = await this.client.get<AnnouncementDto>(
        `/d2l/api/le/${this.versions.le}/${orgUnit}/news/${announcementId}`,
      );
    } catch (err) {
      if (err instanceof D2lApiError && (err.status === 404 || err.status === 403)) return null;
      throw err;
    }
    if (!isVisible(dto)) return null;
    const names = await this.authorNamesFor(orgUnit, [dto]);
    return toAnnouncement(dto, orgUnit, names);
  }

  async downloadAnnouncementAttachment(
    courseId: OrgUnitId,
    announcementId: number,
    attachmentId: number,
  ): Promise<Buffer> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    return this.client.getRaw(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/news/${announcementId}/attachments/${attachmentId}`,
    );
  }

  /**
   * News items only carry the author's user id (`CreatedBy`). The LP user
   * route is 403 for students, but the course classlist is readable, so it is
   * fetched once per course. Any failure means "no author names" (never show
   * the raw id).
   */
  private async authorNamesFor(orgUnit: number, dtos: AnnouncementDto[]): Promise<Map<string, string>> {
    if (!dtos.some((d) => authorIdOf(d) !== null)) return new Map();
    let pending = this.authorNames.get(orgUnit);
    if (!pending) {
      pending = this.client
        .get<ClasslistUserDto[]>(`/d2l/api/le/${this.versions.le}/${orgUnit}/classlist/`)
        .then((users) => {
          const map = new Map<string, string>();
          for (const u of users) if (u.DisplayName) map.set(String(u.Identifier), u.DisplayName);
          return map;
        })
        .catch((err: unknown) => {
          // 403/404 (classlist disabled for this course) is permanent; retry anything else next time.
          const permanent = err instanceof D2lApiError && (err.status === 403 || err.status === 404);
          if (!permanent) this.authorNames.delete(orgUnit);
          return new Map<string, string>();
        });
      this.authorNames.set(orgUnit, pending);
    }
    return pending;
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
    const orgUnit = OrgUnitId.toNumber(input.courseId);
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
    const orgUnit = OrgUnitId.toNumber(input.courseId);
    const path = `/d2l/api/le/${this.versions.le}/${orgUnit}/news/${input.announcementId}/mark-read`;
    await this.client.postJson(path, {});
  }
}
