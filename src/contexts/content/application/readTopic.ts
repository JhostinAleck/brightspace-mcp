import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { findTopic } from '@/contexts/content/domain/ContentTree.js';
import type { Topic } from '@/contexts/content/domain/Topic.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface ReadTopicInput {
  repo: ContentRepository;
  courseId: OrgUnitId;
  topicId: number;
}

export type TopicReadResult =
  /** D2L marks the topic IsBroken (its file was deleted/unlinked). */
  | { status: 'broken'; topic: Topic }
  /** Link, quiz, LTI, … — there is no file behind it; `topic.url` is the target. */
  | { status: 'not_downloadable'; topic: Topic }
  /**
   * The topic's file. `filename` is the topic URL (a /content/enforced/ path)
   * when known: a format hint and the base for resolving relative links.
   */
  | { status: 'file'; topic: Topic | null; content: Buffer; filename: string | null };

function isDownloadable(topic: Topic): boolean {
  if (topic.kind === 'file') return true;
  // Unclassified topics that still point at the course file area are files too.
  return topic.kind === 'other' && (topic.url?.startsWith('/content/') ?? false);
}

/**
 * Read a content topic. Looks the topic up in the (cached) module tree first
 * so non-file topics are answered from metadata instead of a guaranteed 404
 * on /topics/{id}/file. Unknown topics are still downloaded optimistically.
 */
export async function readTopic(input: ReadTopicInput): Promise<TopicReadResult> {
  // Metadata is best-effort; the download below is authoritative.
  const topic: Topic | null = await input.repo
    .findModules(input.courseId)
    .then((mods) => findTopic(mods, input.topicId)?.topic ?? null)
    .catch(() => null);
  if (topic?.isBroken) return { status: 'broken', topic };
  if (topic && !isDownloadable(topic)) return { status: 'not_downloadable', topic };
  const content = await input.repo.findTopicFile(input.courseId, input.topicId);
  return { status: 'file', topic, content, filename: topic?.url ?? null };
}
