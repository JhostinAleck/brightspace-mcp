import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import type { Rubric } from '@/contexts/assignments/domain/Rubric.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetAssignmentRubricInput {
  repo: AssignmentRepository;
  courseId: OrgUnitId;
  assignmentId: AssignmentId;
}

export function getAssignmentRubric(input: GetAssignmentRubricInput): Promise<Rubric[]> {
  return input.repo.findRubrics(input.courseId, input.assignmentId);
}
