import { z } from 'zod';

import type { IdempotencyStore } from '@/shared-kernel/idempotency/IdempotencyStore.js';
import type { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import type { WritesGate } from '@/shared-kernel/writes/WritesGate.js';
import { submitAssignment } from '@/contexts/assignments/application/submitAssignment.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';

export const submitAssignmentSchema = z.object({
  course_id: z.string().min(1),
  folder_id: z.string().min(1),
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
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

  deps.auditLogger.recordWriteAttempt({
    correlationId,
    tool: 'submit_assignment',
    args: {
      course_id: params.course_id,
      folder_id: params.folder_id,
      filename: params.filename,
      bytes: Buffer.from(params.content_base64, 'base64').byteLength,
      idempotency_key: params.idempotency_key,
    },
  });

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
    contentBase64: params.content_base64,
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
