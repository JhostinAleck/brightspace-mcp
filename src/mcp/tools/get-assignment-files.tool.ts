import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { getAssignmentFilesSchema } from '@/mcp/schemas.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';

export interface GetAssignmentFilesDeps { assignmentRepo: AssignmentRepository; }

export async function handleGetAssignmentFiles(deps: GetAssignmentFilesDeps, rawInput: unknown) {
  const input = getAssignmentFilesSchema.parse(rawInput);
  const result = await deps.assignmentRepo.findFiles(
    OrgUnitId.of(input.course_id),
    AssignmentId.of(input.assignment_id),
  );

  const lines: string[] = [];
  lines.push(`# ${result.assignmentName}`);
  if (result.instructions) {
    lines.push('\n## Instrucciones\n' + result.instructions);
  }
  if (result.files.length === 0) {
    lines.push('\nNo hay archivos adjuntos.');
  } else {
    lines.push(`\n## Archivos adjuntos (${result.files.length})`);
    for (const f of result.files) {
      lines.push(`\n### ${f.name}`);
      const content = result.fileContents[f.name];
      if (content) lines.push(content);
    }
  }

  return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
}
