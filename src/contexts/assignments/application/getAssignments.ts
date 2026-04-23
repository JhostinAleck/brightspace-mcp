import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetAssignmentsInput {
  repo: AssignmentRepository;
  courseId: OrgUnitId;
  now?: Date;
  includePast?: boolean;
}

export async function getAssignments(input: GetAssignmentsInput): Promise<Assignment[]> {
  const all = await input.repo.findByCourse(input.courseId);
  if (input.includePast) return all;
  const now = input.now ?? new Date();
  return all.filter((a) => !a.dueDate.isPastAt(now));
}
