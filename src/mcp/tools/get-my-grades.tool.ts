import type { GradeRepository } from '@/contexts/grades/domain/GradeRepository.js';
import { getMyGrades } from '@/contexts/grades/application/getMyGrades.js';
import { getMyGradesSchema } from '@/mcp/schemas.js';
import { gradesToCompact, gradesToDetailed } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetMyGradesDeps { gradeRepo: GradeRepository; output: OutputContext; }

export async function handleGetMyGrades(deps: GetMyGradesDeps, rawInput: unknown) {
  const input = getMyGradesSchema.parse(rawInput);
  const grades = await getMyGrades({
    repo: deps.gradeRepo,
    courseId: OrgUnitId.of(input.course_id),
  });
  const text = input.format === 'detailed' ? gradesToDetailed(grades, deps.output) : gradesToCompact(grades, deps.output);
  const footer = deps.output.metaFooter();
  const body = footer ? `${text}\n\n${footer}` : text;
  return { content: [{ type: 'text' as const, text: body }] };
}
