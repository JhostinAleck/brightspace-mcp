import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { Announcement } from '@/contexts/communications/domain/Announcement.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetAnnouncementInput {
  repo: CommunicationsRepository;
  courseId: OrgUnitId;
  announcementId: number;
}

export async function getAnnouncement(input: GetAnnouncementInput): Promise<Announcement | null> {
  return input.repo.findAnnouncement(input.courseId, input.announcementId);
}
