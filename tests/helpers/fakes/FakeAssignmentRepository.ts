import type { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import type {
  AssignmentRepository,
  AssignmentFile,
  AssignmentFilesResult,
  SubmitInput,
  SubmitResult,
} from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { Feedback } from '@/contexts/assignments/domain/Feedback.js';
import type { Rubric } from '@/contexts/assignments/domain/Rubric.js';
import type { MySubmission } from '@/contexts/assignments/domain/MySubmission.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export class FakeAssignmentRepository implements AssignmentRepository {
  constructor(
    private readonly byCourse: Map<number, Assignment[]>,
    private readonly feedbackByAssignment: Map<string, Feedback> = new Map(),
    private readonly rubricsByAssignment: Map<string, Rubric[]> = new Map(),
    private readonly submissionsByAssignment: Map<string, MySubmission[]> = new Map(),
    private readonly binaries: Map<string, Buffer> = new Map(),
  ) {}

  async findMySubmissions(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<MySubmission[]> {
    const key = `${OrgUnitId.toNumber(courseId)}:${AssignmentId.toNumber(assignmentId)}`;
    return this.submissionsByAssignment.get(key) ?? [];
  }

  async findFileBinary(_courseId: OrgUnitId, file: AssignmentFile): Promise<Buffer> {
    const bin = this.binaries.get(file.url);
    if (!bin) throw new Error(`no binary for ${file.url}`);
    return bin;
  }

  async findByCourse(courseId: OrgUnitId): Promise<Assignment[]> {
    return this.byCourse.get(OrgUnitId.toNumber(courseId)) ?? [];
  }

  async findFeedback(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Feedback | null> {
    const key = `${OrgUnitId.toNumber(courseId)}:${AssignmentId.toNumber(assignmentId)}`;
    return this.feedbackByAssignment.get(key) ?? null;
  }

  async findRubrics(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Rubric[]> {
    const key = `${OrgUnitId.toNumber(courseId)}:${AssignmentId.toNumber(assignmentId)}`;
    return this.rubricsByAssignment.get(key) ?? [];
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
