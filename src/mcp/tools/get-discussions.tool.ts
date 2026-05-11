import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import { getDiscussions } from '@/contexts/communications/application/getDiscussions.js';
import { getDiscussionsSchema } from '@/mcp/schemas.js';
import { discussionsToText } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetDiscussionsDeps { communicationsRepo: CommunicationsRepository; output: OutputContext; }

export async function handleGetDiscussions(deps: GetDiscussionsDeps, rawInput: unknown) {
  const input = getDiscussionsSchema.parse(rawInput);
  const forums = await getDiscussions({ repo: deps.communicationsRepo, courseId: OrgUnitId.of(input.course_id) });
  return { content: [{ type: 'text' as const, text: discussionsToText(forums, deps.output) }] };
}
