import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

import type { Assignment } from './Assignment.js';
import type { AssignmentId } from './AssignmentId.js';
import type { Feedback } from './Feedback.js';

export interface AssignmentRepository {
  findByCourse(courseId: OrgUnitId): Promise<Assignment[]>;
  findFeedback(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Feedback | null>;
}
