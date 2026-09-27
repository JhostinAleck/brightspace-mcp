import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { Announcement } from '@/contexts/communications/domain/Announcement.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetAnnouncementsInput {
  repo: CommunicationsRepository;
  courseId: OrgUnitId;
  limit?: number;
}

export async function getAnnouncements(input: GetAnnouncementsInput): Promise<Announcement[]> {
  const all = await input.repo.findAnnouncements(input.courseId);
  // Pinned first (as in the Brightspace UI), then newest first.
  const sorted = all
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.postedAt.getTime() - a.postedAt.getTime());
  return input.limit ? sorted.slice(0, input.limit) : sorted;
}
