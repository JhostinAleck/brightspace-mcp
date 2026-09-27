import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Topic } from '@/contexts/content/domain/Topic.js';
import { readTopic } from '@/contexts/content/application/readTopic.js';
import { getTopicFileSchema } from '@/mcp/schemas.js';
import { extractedToMcpContent, saveBufferToDisk, type McpContentBlock } from '@/mcp/file-content.js';
import { extractFileContent } from '@/shared-kernel/extract/extractFileContent.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetTopicFileDeps { contentRepo: ContentRepository; }

const NON_FILE_HINTS: Record<string, string> = {
  link: 'It is a web link, not a file: open the URL directly.',
  quiz: 'It is a quiz quicklink: use list_quizzes / get_quiz_attempts for quiz details.',
  lti: 'It is an external tool (LTI) launch: it can only be opened inside Brightspace.',
  dropbox: 'It is an assignment (dropbox) quicklink: use get_assignments / get_assignment_files.',
  discussion: 'It is a discussion quicklink: use get_discussions.',
  other: 'It has no downloadable file.',
};

const KIND_LABEL: Record<string, string> = { lti: 'an LTI', other: 'an unclassified' };

function nonFileMessage(topic: Topic): string {
  const url = topic.url ? `\nURL: ${topic.url}` : '';
  const kind = KIND_LABEL[topic.kind] ?? `a ${topic.kind}`;
  return `"${topic.title}" (id=${topic.id}) is ${kind} topic. ${NON_FILE_HINTS[topic.kind] ?? NON_FILE_HINTS['other']}${url}`;
}

function brokenMessage(topic: Topic): string {
  return `"${topic.title}" (id=${topic.id}) is marked as broken in Brightspace: its file was deleted or unlinked, ` +
    'so there is nothing to download. Check get_course_content for a replacement or ask the instructor.';
}

const text = (t: string): { content: McpContentBlock[] } => ({ content: [{ type: 'text', text: t }] });

export async function handleGetTopicFile(deps: GetTopicFileDeps, rawInput: unknown) {
  const input = getTopicFileSchema.parse(rawInput);
  const courseId = OrgUnitId.of(input.course_id);
  const result = await readTopic({ repo: deps.contentRepo, courseId, topicId: input.topic_id });

  if (result.status === 'broken') return text(brokenMessage(result.topic));
  if (result.status === 'not_downloadable') return text(nonFileMessage(result.topic));

  const notes: string[] = [];
  if (input.save_to) notes.push(`[Saved to: ${saveBufferToDisk(result.content, input.save_to)}]`);

  const extracted = await extractFileContent(result.content, { filename: result.filename });
  const isHtmlTopic = ['html', 'htm'].includes(result.topic?.fileExtension ?? '') || extracted.format === 'html';

  // Only HTML pages may need the browser-rendered view (e.g. JS-built pages).
  // Never for images/media/binaries: that view is the D2L page chrome.
  if (isHtmlTopic && (extracted.kind !== 'text' || extracted.text.trim() === '')) {
    const rendered = await deps.contentRepo.findTopicRenderedText(courseId, input.topic_id);
    if (rendered) return text([rendered, ...notes].join('\n\n'));
  }

  if (extracted.kind === 'text' && extracted.format === 'html' && extracted.text.includes('/content/enforced/')) {
    notes.push('[Linked course files (/content/enforced/...) can be read with get_course_file(course_id, path).]');
  }
  return { content: extractedToMcpContent(extracted, { notes }) };
}
