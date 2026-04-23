import { createSubmissionDraft } from '@/contexts/assignments/domain/SubmissionDraft.js';
import type {
  AssignmentRepository,
  SubmitResult,
} from '@/contexts/assignments/domain/AssignmentRepository.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface SubmitAssignmentInput {
  repo: AssignmentRepository;
  courseId: string;
  folderId: string;
  filename: string;
  contentBase64: string;
  mimeType?: string;
}

export async function submitAssignment(input: SubmitAssignmentInput): Promise<SubmitResult> {
  const draft = createSubmissionDraft({
    filename: input.filename,
    content: Buffer.from(input.contentBase64, 'base64'),
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
  });
  return input.repo.submit({
    courseId: createOrgUnitId(input.courseId),
    folderId: input.folderId,
    draft,
  });
}
