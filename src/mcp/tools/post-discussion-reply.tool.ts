import { z } from 'zod';

import type { IdempotencyStore } from '@/shared-kernel/idempotency/IdempotencyStore.js';
import type { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import type { WritesGate } from '@/shared-kernel/writes/WritesGate.js';
import { postDiscussionReply } from '@/contexts/communications/application/postDiscussionReply.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';

export const postDiscussionReplySchema = z.object({
  course_id: z.string().min(1),
  forum_id: z.string().min(1),
  topic_id: z.string().min(1),
  body: z.string().min(1).max(10_000),
  idempotency_key: z.string().min(8).max(128),
});

export type PostDiscussionReplyParams = z.infer<typeof postDiscussionReplySchema>;

export interface PostDiscussionReplyDeps {
  communicationsRepo: CommunicationsRepository;
  idempotencyStore: IdempotencyStore;
  auditLogger: AuditLogger;
  writesGate: WritesGate;
}

export async function handlePostDiscussionReply(
  params: PostDiscussionReplyParams,
  deps: PostDiscussionReplyDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const correlationId = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Idempotency check FIRST so replays don't inflate audit logs.
  const cacheKey = `post_discussion_reply:${params.idempotency_key}`;
  const cached = await deps.idempotencyStore.get<{ postId: string; postedAt: string }>(cacheKey);
  if (cached) {
    return {
      content: [{
        type: 'text',
        text: `Reply ${cached.postId} (replay, idempotent) at ${cached.postedAt}`,
      }],
    };
  }

  deps.auditLogger.recordWriteAttempt({
    correlationId,
    tool: 'post_discussion_reply',
    args: {
      course_id: params.course_id,
      forum_id: params.forum_id,
      topic_id: params.topic_id,
      body_length: params.body.length,
      idempotency_key: params.idempotency_key,
    },
  });

  if (deps.writesGate.isDryRun) {
    return {
      content: [{
        type: 'text',
        text: `[dry-run] would post reply to topic ${params.topic_id} in forum ${params.forum_id}, course ${params.course_id}`,
      }],
    };
  }

  const result = await postDiscussionReply({
    repo: deps.communicationsRepo,
    courseId: params.course_id,
    forumId: params.forum_id,
    topicId: params.topic_id,
    body: params.body,
  });

  await deps.idempotencyStore.put(cacheKey, {
    postId: result.postId,
    postedAt: result.postedAt.toISOString(),
  });

  return {
    content: [{
      type: 'text',
      text: `Posted reply ${result.postId} at ${result.postedAt.toISOString()} (cid=${correlationId})`,
    }],
  };
}
