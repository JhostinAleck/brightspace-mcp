import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import { getAnnouncements } from '@/contexts/communications/application/getAnnouncements.js';
import { getAnnouncementsSchema } from '@/mcp/schemas.js';
import { announcementsToText } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetAnnouncementsDeps { communicationsRepo: CommunicationsRepository; output: OutputContext; }

export async function handleGetAnnouncements(deps: GetAnnouncementsDeps, rawInput: unknown) {
  const input = getAnnouncementsSchema.parse(rawInput);
  const items = await getAnnouncements({ repo: deps.communicationsRepo, courseId: OrgUnitId.of(input.course_id), limit: input.limit });
  const text = announcementsToText(items, deps.output);
  const footer = deps.output.metaFooter();
  const body = footer ? `${text}\n\n${footer}` : text;
  return { content: [{ type: 'text' as const, text: body }] };
}
