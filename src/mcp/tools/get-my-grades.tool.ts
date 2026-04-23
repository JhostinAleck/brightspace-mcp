import type { GradeRepository } from '@/contexts/grades/domain/GradeRepository.js';
import { getMyGrades } from '@/contexts/grades/application/getMyGrades.js';
import { getMyGradesSchema } from '@/mcp/schemas.js';
import { gradesToCompact, gradesToDetailed } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetMyGradesDeps { gradeRepo: GradeRepository; }

export async function handleGetMyGrades(deps: GetMyGradesDeps, rawInput: unknown) {
  const input = getMyGradesSchema.parse(rawInput);
  const grades = await getMyGrades({
    repo: deps.gradeRepo,
    courseId: OrgUnitId.of(input.course_id),
  });
  const text = input.format === 'detailed' ? gradesToDetailed(grades) : gradesToCompact(grades);
  return { content: [{ type: 'text' as const, text }] };
}
