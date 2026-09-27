import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { Announcement, AnnouncementAttachment } from '@/contexts/communications/domain/Announcement.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface ReadAnnouncementAttachmentInput {
  repo: CommunicationsRepository;
  courseId: OrgUnitId;
  announcementId: number;
  attachmentId: number;
}

export type ReadAnnouncementAttachmentResult =
  | { status: 'announcement_not_found' }
  | { status: 'attachment_not_found'; announcement: Announcement }
  | { status: 'ok'; announcement: Announcement; attachment: AnnouncementAttachment; content: Buffer };

/** Download an attachment, only if it is actually listed on the announcement. */
export async function readAnnouncementAttachment(
  input: ReadAnnouncementAttachmentInput,
): Promise<ReadAnnouncementAttachmentResult> {
  const announcement = await input.repo.findAnnouncement(input.courseId, input.announcementId);
  if (!announcement) return { status: 'announcement_not_found' };
  const attachment = announcement.attachments.find((a) => a.id === input.attachmentId);
  if (!attachment) return { status: 'attachment_not_found', announcement };
  const content = await input.repo.downloadAnnouncementAttachment(
    input.courseId,
    input.announcementId,
    input.attachmentId,
  );
  return { status: 'ok', announcement, attachment, content };
}
