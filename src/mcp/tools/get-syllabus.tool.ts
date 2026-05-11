import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { getSyllabus } from '@/contexts/content/application/getSyllabus.js';
import { getSyllabusSchema } from '@/mcp/schemas.js';
import { syllabusToText } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetSyllabusDeps { contentRepo: ContentRepository; output: OutputContext; }

export async function handleGetSyllabus(deps: GetSyllabusDeps, rawInput: unknown) {
  const input = getSyllabusSchema.parse(rawInput);
  const syl = await getSyllabus({ repo: deps.contentRepo, courseId: OrgUnitId.of(input.course_id) });
  return { content: [{ type: 'text' as const, text: syllabusToText(syl, deps.output) }] };
}
