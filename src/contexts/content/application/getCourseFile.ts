import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { findTopic } from '@/contexts/content/domain/ContentTree.js';
import { CourseFilePath, InvalidCourseFilePathError } from '@/contexts/content/domain/CourseFilePath.js';
import { resolveContentUrl } from '@/shared-kernel/text/htmlLinks.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetCourseFileInput {
  repo: ContentRepository;
  courseId: OrgUnitId;
  /** /content/enforced/… path, full tenant URL, or a link relative to `topicId`'s page. */
  rawPath: string;
  /** HTML topic the (relative) link was found in. */
  topicId?: number | undefined;
  /** Tenant origin; absolute URLs are only accepted on it. */
  origin?: string | null | undefined;
}

export interface CourseFile {
  path: CourseFilePath;
  content: Buffer;
}

/**
 * Download a file from the course's own content area — the PDFs/slides that
 * HTML topics and module descriptions link or embed. Paths are validated by
 * CourseFilePath (course-scoped, no traversal, no foreign hosts).
 */
export async function getCourseFile(input: GetCourseFileInput): Promise<CourseFile> {
  const orgUnit = OrgUnitId.toNumber(input.courseId);
  let raw = input.rawPath;
  if (CourseFilePath.isRelative(raw)) {
    if (input.topicId === undefined) {
      throw new InvalidCourseFilePathError(
        `"${raw}" is a relative link; pass the topic_id of the page it appears in, or a path starting with /content/enforced/.`,
      );
    }
    const hit = findTopic(await input.repo.findModules(input.courseId), input.topicId);
    const base = hit?.topic.url;
    if (!base) {
      throw new InvalidCourseFilePathError(`Topic ${input.topicId} has no URL to resolve "${raw}" against.`);
    }
    raw = resolveContentUrl(raw, base);
  }
  const path = CourseFilePath.parse(raw, orgUnit, { origin: input.origin ?? null });
  const content = await input.repo.findCourseFile(input.courseId, path);
  return { path, content };
}
