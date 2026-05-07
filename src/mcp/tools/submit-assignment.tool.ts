import { z } from 'zod';

import type { IdempotencyStore } from '@/shared-kernel/idempotency/IdempotencyStore.js';
import type { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import type { WritesGate } from '@/shared-kernel/writes/WritesGate.js';
import { submitAssignment } from '@/contexts/assignments/application/submitAssignment.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';

// 50 MB binary cap → ceil(50_000_000 / 3) * 4 ≈ 66_666_668 base64 chars.
// Hard-cap ASCII length so a malicious caller cannot OOM the process before
// we even decode the payload.
export const SUBMIT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_BASE64_LEN = Math.ceil(SUBMIT_MAX_BYTES / 3) * 4 + 4;

export const submitAssignmentSchema = z.object({
  course_id: z.string().min(1),
  folder_id: z.string().min(1),
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1).max(MAX_BASE64_LEN),
  mime_type: z.string().optional(),
  idempotency_key: z.string().min(8).max(128),
});

export type SubmitAssignmentParams = z.infer<typeof submitAssignmentSchema>;

export interface SubmitAssignmentDeps {
  assignmentRepo: AssignmentRepository;
  idempotencyStore: IdempotencyStore;
  auditLogger: AuditLogger;
  writesGate: WritesGate;
}

export async function handleSubmitAssignment(
  params: SubmitAssignmentParams,
  deps: SubmitAssignmentDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const correlationId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Idempotency check FIRST so replays don't inflate audit logs nor decode the
  // payload twice.
  const cacheKey = `submit_assignment:${params.idempotency_key}`;
  const cached = await deps.idempotencyStore.get<{ submissionId: string; submittedAt: string }>(cacheKey);
  if (cached) {
    return {
      content: [{
        type: 'text',
        text: `Submission ${cached.submissionId} (replay, idempotent) at ${cached.submittedAt}`,
      }],
    };
  }

  // Single decode + size enforcement. Re-using the buffer downstream avoids
  // doubling memory pressure on large attachments.
  const content = Buffer.from(params.content_base64, 'base64');
  if (content.byteLength === 0) {
    throw new Error('content is empty');
  }
  if (content.byteLength > SUBMIT_MAX_BYTES) {
    throw new Error(
      `content exceeds maximum allowed size (${content.byteLength} > ${SUBMIT_MAX_BYTES} bytes)`,
    );
  }

  deps.auditLogger.recordWriteAttempt({
    correlationId,
    tool: 'submit_assignment',
    args: {
      course_id: params.course_id,
      folder_id: params.folder_id,
      filename: params.filename,
      bytes: content.byteLength,
      idempotency_key: params.idempotency_key,
    },
  });

  if (deps.writesGate.isDryRun) {
    return {
      content: [{
        type: 'text',
        text: `[dry-run] would submit ${params.filename} to folder ${params.folder_id} in course ${params.course_id}`,
      }],
    };
  }

  const result = await submitAssignment({
    repo: deps.assignmentRepo,
    courseId: params.course_id,
    folderId: params.folder_id,
    filename: params.filename,
    content,
    ...(params.mime_type !== undefined ? { mimeType: params.mime_type } : {}),
  });

  await deps.idempotencyStore.put(cacheKey, {
    submissionId: result.submissionId,
    submittedAt: result.submittedAt.toISOString(),
  });

  return {
    content: [{
      type: 'text',
      text: `Submitted ${params.filename} — submissionId ${result.submissionId} at ${result.submittedAt.toISOString()} (cid=${correlationId})`,
    }],
  };
}
