import { z } from 'zod';

import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { getModule } from '@/contexts/content/application/getModule.js';
import { formatLink } from '@/mcp/module-description.js';
import { DEFAULT_MAX_CHARS } from '@/shared-kernel/extract/extractFileContent.js';
import { extractHtmlLinks, htmlToText } from '@/shared-kernel/text/htmlLinks.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export const getModuleSchema = z.object({
  course_id: z.number().int().positive(),
  module_id: z.number().int().positive().describe('Module id, shown as module_id=… by get_course_content.'),
}).strict();

export interface GetModuleDeps { contentRepo: ContentRepository; }

export async function handleGetModule(deps: GetModuleDeps, rawInput: unknown) {
  const input = getModuleSchema.parse(rawInput);
  const module = await getModule({
    repo: deps.contentRepo,
    courseId: OrgUnitId.of(input.course_id),
    moduleId: input.module_id,
  });
  if (!module) {
    return {
      content: [{
        type: 'text' as const,
        text: `Module ${input.module_id} not found in course ${input.course_id}. Use get_course_content to list module ids.`,
      }],
    };
  }

  const parts: string[] = [`### ${module.title} (module_id=${module.id})`];
  const html = module.descriptionHtml;
  if (html) {
    let body = htmlToText(html);
    if (body.length > DEFAULT_MAX_CHARS) {
      body = `${body.slice(0, DEFAULT_MAX_CHARS)}\n\n[Truncated: showing the first ${DEFAULT_MAX_CHARS} of ${body.length} characters.]`;
    }
    if (body) parts.push(body);
    const links = extractHtmlLinks(html);
    if (links.length > 0) parts.push(`Links (${links.length}):\n${links.map((l) => `- ${formatLink(l)}`).join('\n')}`);
  } else {
    parts.push('_This module has no description._');
  }
  if (module.topics.length > 0) {
    const topics = module.topics.map((t) =>
      `- ${t.title} [${t.kind}] (id=${t.id})${t.isBroken ? ' [broken]' : ''}${t.url ? ` — ${t.url}` : ''}`);
    parts.push(`Topics (${module.topics.length}):\n${topics.join('\n')}`);
  }
  if (module.submodules.length > 0) {
    parts.push(`Submodules (${module.submodules.length}):\n${module.submodules.map((m) => `- ${m.title} (module_id=${m.id})`).join('\n')}`);
  }
  const text = parts.join('\n\n');
  const hint = text.includes('/content/enforced/')
    ? '\n\n_Download linked /content/enforced/... files with get_course_file(course_id, path); read topics with get_topic_file._'
    : '';
  return { content: [{ type: 'text' as const, text: text + hint }] };
}
