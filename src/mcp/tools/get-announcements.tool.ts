import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import { getAnnouncements } from '@/contexts/communications/application/getAnnouncements.js';
import { getAnnouncementsSchema } from '@/mcp/schemas.js';
import { announcementsToText } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetAnnouncementsDeps { communicationsRepo: CommunicationsRepository; output: OutputContext; }

export async function handleGetAnnouncements(deps: GetAnnouncementsDeps, rawInput: unknown) {
  const input = getAnnouncementsSchema.parse(rawInput);
  // D2L returns every announcement in one response; slice here so the header can say "N of M".
  const all = await getAnnouncements({ repo: deps.communicationsRepo, courseId: OrgUnitId.of(input.course_id) });
  const text = announcementsToText(all.slice(0, input.limit), deps.output, { total: all.length });
  const footer = deps.output.metaFooter();
  const body = footer ? `${text}\n\n${footer}` : text;
  return { content: [{ type: 'text' as const, text: body }] };
}
