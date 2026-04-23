import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type {
  CommunicationsRepository,
  PostReplyResult,
} from '@/contexts/communications/domain/CommunicationsRepository.js';

export interface PostDiscussionReplyInput {
  repo: CommunicationsRepository;
  courseId: string;
  forumId: string;
  topicId: string;
  body: string;
}

export async function postDiscussionReply(
  input: PostDiscussionReplyInput,
): Promise<PostReplyResult> {
  const body = input.body.trim();
  if (body.length === 0) throw new Error('reply body cannot be empty');
  if (body.length > 10_000) throw new Error('reply body too long (max 10000 chars)');
  return input.repo.postReply({
    courseId: createOrgUnitId(input.courseId),
    forumId: input.forumId,
    topicId: input.topicId,
    body,
  });
}
