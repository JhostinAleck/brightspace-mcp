import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';

export interface MarkAnnouncementReadInputDto {
  repo: CommunicationsRepository;
  courseId: string;
  announcementId: string;
}

export async function markAnnouncementRead(input: MarkAnnouncementReadInputDto): Promise<void> {
  if (input.announcementId.length === 0) throw new Error('announcementId required');
  await input.repo.markAnnouncementRead({
    courseId: createOrgUnitId(input.courseId),
    announcementId: input.announcementId,
  });
}
