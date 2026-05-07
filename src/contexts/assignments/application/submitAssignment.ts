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
  /** Pre-decoded content. Prefer this over `contentBase64` to avoid double-decoding. */
  content?: Uint8Array;
  /** Base64-encoded fallback for callers that do not pre-decode. */
  contentBase64?: string;
  mimeType?: string;
}

export async function submitAssignment(input: SubmitAssignmentInput): Promise<SubmitResult> {
  const content = input.content
    ?? (input.contentBase64 ? Buffer.from(input.contentBase64, 'base64') : null);
  if (!content) {
    throw new Error('submitAssignment requires either `content` or `contentBase64`');
  }
  const draft = createSubmissionDraft({
    filename: input.filename,
    content,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
  });
  return input.repo.submit({
    courseId: createOrgUnitId(input.courseId),
    folderId: input.folderId,
    draft,
  });
}
