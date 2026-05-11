import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { getAssignments } from '@/contexts/assignments/application/getAssignments.js';
import { getAssignmentsSchema } from '@/mcp/schemas.js';
import { assignmentsToCompact, assignmentsToDetailed } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetAssignmentsDeps { assignmentRepo: AssignmentRepository; output: OutputContext; }

export async function handleGetAssignments(deps: GetAssignmentsDeps, rawInput: unknown) {
  const input = getAssignmentsSchema.parse(rawInput);
  const list = await getAssignments({
    repo: deps.assignmentRepo,
    courseId: OrgUnitId.of(input.course_id),
    includePast: input.include_past,
  });
  const text = input.format === 'detailed' ? assignmentsToDetailed(list, deps.output) : assignmentsToCompact(list, deps.output);
  const footer = deps.output.metaFooter();
  const body = footer ? `${text}\n\n${footer}` : text;
  return { content: [{ type: 'text' as const, text: body }] };
}
