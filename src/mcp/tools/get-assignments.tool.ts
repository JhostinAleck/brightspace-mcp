import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { getAssignments } from '@/contexts/assignments/application/getAssignments.js';
import { getAssignmentsSchema } from '@/mcp/schemas.js';
import { assignmentsToCompact, assignmentsToDetailed } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetAssignmentsDeps { assignmentRepo: AssignmentRepository; }

export async function handleGetAssignments(deps: GetAssignmentsDeps, rawInput: unknown) {
  const input = getAssignmentsSchema.parse(rawInput);
  const list = await getAssignments({
    repo: deps.assignmentRepo,
    courseId: OrgUnitId.of(input.course_id),
    includePast: input.include_past,
  });
  const text = input.format === 'detailed' ? assignmentsToDetailed(list) : assignmentsToCompact(list);
  return { content: [{ type: 'text' as const, text }] };
}
