import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { getCourseContent } from '@/contexts/content/application/getCourseContent.js';
import { getCourseContentSchema } from '@/mcp/schemas.js';
import { courseContentToText } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetCourseContentDeps { contentRepo: ContentRepository; output: OutputContext; }

export async function handleGetCourseContent(deps: GetCourseContentDeps, rawInput: unknown) {
  const input = getCourseContentSchema.parse(rawInput);
  const modules = await getCourseContent({ repo: deps.contentRepo, courseId: OrgUnitId.of(input.course_id) });
  return { content: [{ type: 'text' as const, text: courseContentToText(modules, input.depth, deps.output) }] };
}
