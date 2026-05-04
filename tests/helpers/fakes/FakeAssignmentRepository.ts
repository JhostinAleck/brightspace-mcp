import type { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import type {
  AssignmentRepository,
  AssignmentFilesResult,
  SubmitInput,
  SubmitResult,
} from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { Feedback } from '@/contexts/assignments/domain/Feedback.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export class FakeAssignmentRepository implements AssignmentRepository {
  constructor(
    private readonly byCourse: Map<number, Assignment[]>,
    private readonly feedbackByAssignment: Map<string, Feedback> = new Map(),
  ) {}

  async findByCourse(courseId: OrgUnitId): Promise<Assignment[]> {
    return this.byCourse.get(OrgUnitId.toNumber(courseId)) ?? [];
  }

  async findFeedback(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Feedback | null> {
    const key = `${OrgUnitId.toNumber(courseId)}:${AssignmentId.toNumber(assignmentId)}`;
    return this.feedbackByAssignment.get(key) ?? null;
  }

  async findFiles(_courseId: OrgUnitId, assignmentId: AssignmentId): Promise<AssignmentFilesResult> {
    return {
      assignmentId: String(AssignmentId.toNumber(assignmentId)),
      assignmentName: '',
      instructions: '',
      files: [],
      fileContents: {},
    };
  }

  async submit(_input: SubmitInput): Promise<SubmitResult> {
    throw new Error('FakeAssignmentRepository.submit is not implemented — stub for interface completeness');
  }
}
