import type { GroupRepository } from '@/contexts/groups/domain/Group.js';
import { z } from 'zod';

import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export const getMyGroupsSchema = z.object({
  course_id: z.number().int().positive(),
}).strict();

export interface GetMyGroupsDeps {
  groupRepo: GroupRepository;
}

export async function handleGetMyGroups(deps: GetMyGroupsDeps, rawInput: unknown) {
  const input = getMyGroupsSchema.parse(rawInput);
  const groups = await deps.groupRepo.findMyGroups(createOrgUnitId(String(input.course_id)));

  if (groups.length === 0) {
    return { content: [{ type: 'text' as const, text: 'You are not in any groups in this course.' }] };
  }

  const sections = groups.map((g) => {
    const members = g.members.length > 0
      ? g.members.map((m) => `   - ${m.displayName}${m.username ? ` (${m.username})` : ''}`).join('\n')
      : '   (no members listed)';
    return ` • ${g.categoryName} → ${g.name} (id=${g.id})\n   Members:\n${members}`;
  });
  return {
    content: [{
      type: 'text' as const,
      text: `Your groups in this course (${groups.length}):\n${sections.join('\n\n')}`,
    }],
  };
}
