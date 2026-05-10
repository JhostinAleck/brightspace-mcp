import { readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { z } from 'zod';

import type { IdempotencyStore } from '@/shared-kernel/idempotency/IdempotencyStore.js';
import type { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import type { WritesGate } from '@/shared-kernel/writes/WritesGate.js';
import { submitAssignment } from '@/contexts/assignments/application/submitAssignment.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import { expandPath } from '@/shared-kernel/path/expandPath.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

// 50 MB binary cap → ceil(50_000_000 / 3) * 4 ≈ 66_666_668 base64 chars.
// Hard-cap ASCII length so a malicious caller cannot OOM the process before
// we even decode the payload.
export const SUBMIT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_BASE64_LEN = Math.ceil(SUBMIT_MAX_BYTES / 3) * 4 + 4;

export const submitAssignmentSchema = z
  .object({
    course_id: z.string().min(1),
    folder_id: z.string().min(1),
    /**
     * Filename to record on the submission. Required when passing
     * `content_base64`; defaults to `basename(file_path)` when passing `file_path`.
     */
    filename: z.string().min(1).max(255).optional(),
    /** Base64-encoded file content. Mutually exclusive with `file_path`. */
    content_base64: z.string().min(1).max(MAX_BASE64_LEN).optional(),
    /**
     * Path to the file on disk (`~/...`, `%VAR%\...`, or absolute). Read
     * server-side; avoids the ~33% token cost of base64 encoding through the LLM.
     * Mutually exclusive with `content_base64`.
     */
    file_path: z.string().min(1).optional(),
    mime_type: z.string().optional(),
    idempotency_key: z.string().min(8).max(128),
    /**
     * Allow the submission even when the assignment has an existing
     * submission and would replace or reject. Defaults to false (we error
     * with a clear message so the caller can confirm before overwriting).
     */
    replace: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    const hasB64 = data.content_base64 !== undefined;
    const hasPath = data.file_path !== undefined;
    if (hasB64 === hasPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of `content_base64` or `file_path`',
      });
    }
    if (hasB64 && data.filename === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`filename` is required when passing `content_base64`',
      });
    }
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

  // Resolve content from one of two sources. The schema's superRefine has
  // already enforced exactly-one-of, so we don't re-check here.
  let content: Buffer;
  let resolvedFilename: string;
  if (params.file_path !== undefined) {
    const abs = resolve(expandPath(params.file_path));
    let size: number;
    try {
      size = statSync(abs).size;
    } catch (err) {
      throw new Error(`file_path could not be read: ${abs} (${(err as Error).message})`);
    }
    if (size === 0) throw new Error(`file_path is empty: ${abs}`);
    if (size > SUBMIT_MAX_BYTES) {
      throw new Error(
        `file_path exceeds maximum allowed size (${size} > ${SUBMIT_MAX_BYTES} bytes): ${abs}`,
      );
    }
    content = readFileSync(abs);
    resolvedFilename = params.filename ?? basename(abs);
  } else {
    // content_base64 path. The schema guarantees this branch when file_path is unset.
    content = Buffer.from(params.content_base64!, 'base64');
    if (content.byteLength === 0) throw new Error('content is empty');
    if (content.byteLength > SUBMIT_MAX_BYTES) {
      throw new Error(
        `content exceeds maximum allowed size (${content.byteLength} > ${SUBMIT_MAX_BYTES} bytes)`,
      );
    }
    resolvedFilename = params.filename!;
  }

  deps.auditLogger.recordWriteAttempt({
    correlationId,
    tool: 'submit_assignment',
    args: {
      course_id: params.course_id,
      folder_id: params.folder_id,
      filename: resolvedFilename,
      bytes: content.byteLength,
      ...(params.file_path !== undefined ? { file_path: params.file_path } : {}),
      idempotency_key: params.idempotency_key,
    },
  });

  // Pre-submit safety check: if the assignment is "only_one" or
  // "replace_previous" AND there's already a submission, refuse unless
  // the caller explicitly opted in via `replace: true`. This avoids
  // accidental overwrites of group work.
  if (!params.replace) {
    try {
      const courseId = createOrgUnitId(params.course_id);
      const folderId = Number(params.folder_id);
      const assignments = await deps.assignmentRepo.findByCourse(courseId);
      const target = assignments.find((a) => AssignmentId.toNumber(a.id) === folderId);
      if (target && target.hasSubmission && target.submissionMode !== 'append') {
        const lastAt = target.submissions[target.submissions.length - 1]!.submittedAt.toISOString();
        const verb = target.submissionMode === 'only_one' ? 'rejected by Brightspace' : 'replaced';
        throw new Error(
          `"${target.name}" already has ${target.submissions.length} submission(s) ` +
          `(latest at ${lastAt}). With submissionMode=${target.submissionMode}, this ` +
          `submission would be ${verb}. Pass \`replace: true\` to confirm.`,
        );
      }
    } catch (err) {
      // Re-throw the explicit guard error; swallow lookup failures (a
      // network blip shouldn't block the submission — D2L itself will
      // enforce its policy).
      if (err instanceof Error && err.message.startsWith('"')) throw err;
    }
  }

  if (deps.writesGate.isDryRun) {
    return {
      content: [{
        type: 'text',
        text: `[dry-run] would submit ${resolvedFilename} to folder ${params.folder_id} in course ${params.course_id}`,
      }],
    };
  }

  const result = await submitAssignment({
    repo: deps.assignmentRepo,
    courseId: params.course_id,
    folderId: params.folder_id,
    filename: resolvedFilename,
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
      text: `Submitted ${resolvedFilename} — submissionId ${result.submissionId} at ${result.submittedAt.toISOString()} (cid=${correlationId})`,
    }],
  };
}
