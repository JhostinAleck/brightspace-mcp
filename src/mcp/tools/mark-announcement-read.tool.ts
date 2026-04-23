import { z } from 'zod';

import type { IdempotencyStore } from '@/shared-kernel/idempotency/IdempotencyStore.js';
import type { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import type { WritesGate } from '@/shared-kernel/writes/WritesGate.js';
import { markAnnouncementRead } from '@/contexts/communications/application/markAnnouncementRead.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';

export const markAnnouncementReadSchema = z.object({
  course_id: z.string().min(1),
  announcement_id: z.string().min(1),
  idempotency_key: z.string().min(8).max(128),
});

export type MarkAnnouncementReadParams = z.infer<typeof markAnnouncementReadSchema>;

export interface MarkAnnouncementReadDeps {
  communicationsRepo: CommunicationsRepository;
  idempotencyStore: IdempotencyStore;
  auditLogger: AuditLogger;
  writesGate: WritesGate;
}

export async function handleMarkAnnouncementRead(
  params: MarkAnnouncementReadParams,
  deps: MarkAnnouncementReadDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const correlationId = `ack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  deps.auditLogger.recordWriteAttempt({
    correlationId,
    tool: 'mark_announcement_read',
    args: {
      course_id: params.course_id,
      announcement_id: params.announcement_id,
      idempotency_key: params.idempotency_key,
    },
  });

  const cacheKey = `mark_announcement_read:${params.idempotency_key}`;
  const cached = await deps.idempotencyStore.get<{ markedAt: string }>(cacheKey);
  if (cached) {
    return {
      content: [{
        type: 'text',
        text: `Announcement ${params.announcement_id} already marked as read (replay, idempotent) at ${cached.markedAt}`,
      }],
    };
  }

  if (deps.writesGate.isDryRun) {
    return {
      content: [{
        type: 'text',
        text: `[dry-run] would mark announcement ${params.announcement_id} as read in course ${params.course_id}`,
      }],
    };
  }

  await markAnnouncementRead({
    repo: deps.communicationsRepo,
    courseId: params.course_id,
    announcementId: params.announcement_id,
  });

  const markedAt = new Date().toISOString();
  await deps.idempotencyStore.put(cacheKey, { markedAt });

  return {
    content: [{
      type: 'text',
      text: `Marked announcement ${params.announcement_id} as read at ${markedAt} (cid=${correlationId})`,
    }],
  };
}
