import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { Feedback } from '@/contexts/assignments/domain/Feedback.js';
import type { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetFeedbackInput {
  repo: AssignmentRepository;
  courseId: OrgUnitId;
  assignmentId: AssignmentId;
}

export function getFeedback(input: GetFeedbackInput): Promise<Feedback | null> {
  return input.repo.findFeedback(input.courseId, input.assignmentId);
}
