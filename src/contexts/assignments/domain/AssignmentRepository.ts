import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

import type { Assignment } from './Assignment.js';
import type { AssignmentId } from './AssignmentId.js';
import type { Feedback } from './Feedback.js';
import type { SubmissionDraft } from './SubmissionDraft.js';

export interface SubmitInput {
  courseId: OrgUnitId;
  folderId: string;
  draft: SubmissionDraft;
}

export interface SubmitResult {
  submissionId: string;
  submittedAt: Date;
}

export interface AssignmentFile {
  name: string;
  url: string;
}

export interface AssignmentFilesResult {
  assignmentId: string;
  assignmentName: string;
  instructions: string;
  files: AssignmentFile[];
  fileContents: Record<string, string>;
}

export interface AssignmentRepository {
  findByCourse(courseId: OrgUnitId): Promise<Assignment[]>;
  findFeedback(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Feedback | null>;
  findFiles(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<AssignmentFilesResult>;
  /**
   * Download the raw bytes of a single attachment. Used by tools that want
   * to save the binary to disk; `findFiles` already returns extracted text
   * for AI consumption.
   */
  findFileBinary(courseId: OrgUnitId, file: AssignmentFile): Promise<Buffer>;
  submit(input: SubmitInput): Promise<SubmitResult>;
}
