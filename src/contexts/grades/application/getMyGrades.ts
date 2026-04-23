import type { GradeRepository } from '@/contexts/grades/domain/GradeRepository.js';
import type { Grade } from '@/contexts/grades/domain/Grade.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetMyGradesInput {
  repo: GradeRepository;
  courseId: OrgUnitId;
}

export async function getMyGrades(input: GetMyGradesInput): Promise<Grade[]> {
  return input.repo.findByCourse(input.courseId);
}
