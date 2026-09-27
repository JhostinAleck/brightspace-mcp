import type { Announcement } from './Announcement.js';
import type { DiscussionForum } from './DiscussionForum.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface PostReplyInput {
  courseId: OrgUnitId;
  forumId: string;
  topicId: string;
  body: string;
}

export interface PostReplyResult {
  postId: string;
  postedAt: Date;
}

export interface MarkAnnouncementReadInput {
  courseId: OrgUnitId;
  announcementId: string;
}

export interface CommunicationsRepository {
  findAnnouncements(courseId: OrgUnitId, opts?: { limit?: number }): Promise<Announcement[]>;
  /** One announcement, or null when it does not exist or is hidden. */
  findAnnouncement(courseId: OrgUnitId, announcementId: number): Promise<Announcement | null>;
  downloadAnnouncementAttachment(courseId: OrgUnitId, announcementId: number, attachmentId: number): Promise<Buffer>;
  findDiscussions(courseId: OrgUnitId): Promise<DiscussionForum[]>;
  postReply(input: PostReplyInput): Promise<PostReplyResult>;
  markAnnouncementRead(input: MarkAnnouncementReadInput): Promise<void>;
}
