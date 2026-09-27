import { z } from 'zod';

import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { getCourseFile } from '@/contexts/content/application/getCourseFile.js';
import { InvalidCourseFilePathError } from '@/contexts/content/domain/CourseFilePath.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { extractedToMcpContent, saveBufferToDisk } from '@/mcp/file-content.js';
import { fileExtension } from '@/shared-kernel/extract/detectFileFormat.js';
import { extractFileContent } from '@/shared-kernel/extract/extractFileContent.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export const getCourseFileSchema = z.object({
  course_id: z.number().int().positive(),
  path: z.string().min(1).max(2048).describe(
    'File path under /content/enforced/{course_id}-…/ as shown in links by get_course_content, ' +
    'get_module or get_topic_file (a full URL on your Brightspace host also works). ' +
    'A relative link (e.g. "files/lab1.pdf") is resolved against the HTML topic given in topic_id.',
  ),
  topic_id: z.number().int().positive().optional().describe(
    'HTML topic the link appeared in; required only when path is relative.',
  ),
  save_to: z.string().optional().describe(
    'Optional absolute or ~/... path where the raw file will be saved on disk. ' +
    'The extracted text is still returned.',
  ),
}).strict();

export interface GetCourseFileDeps {
  contentRepo: ContentRepository;
  /** Tenant base URL; enables passing full https://<tenant>/content/enforced/... URLs. */
  baseUrl: string;
}

const errorResult = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

export async function handleGetCourseFile(
  deps: Pick<GetCourseFileDeps, 'contentRepo'> & Partial<Pick<GetCourseFileDeps, 'baseUrl'>>,
  rawInput: unknown,
) {
  const input = getCourseFileSchema.parse(rawInput);
  let file;
  try {
    file = await getCourseFile({
      repo: deps.contentRepo,
      courseId: OrgUnitId.of(input.course_id),
      rawPath: input.path,
      topicId: input.topic_id,
      origin: deps.baseUrl ?? null,
    });
  } catch (err) {
    if (err instanceof InvalidCourseFilePathError) return errorResult(`Refused: ${err.userMessage}`);
    if (err instanceof D2lApiError && (err.status === 404 || err.status === 403)) {
      return errorResult(
        `Course file not found or not accessible (HTTP ${err.status}): ${input.path}. ` +
        'The link may be stale (content copied from an older course) or the file may be hidden.',
      );
    }
    throw err;
  }

  const extracted = await extractFileContent(file.content, { filename: file.path.path });
  const expected = fileExtension(file.path.path);
  if (extracted.format === 'html' && expected !== null && !['html', 'htm'].includes(expected)) {
    // /content/enforced/ is a web route: an expired session gets redirected to an HTML login page.
    return errorResult(
      `Brightspace returned an HTML page instead of the .${expected} file (${file.path.path}); ` +
      'the session may have expired (run check_auth) or the file is not accessible.',
    );
  }
  const notes: string[] = [];
  if (input.save_to) notes.push(`[Saved to: ${saveBufferToDisk(file.content, input.save_to)}]`);
  if (extracted.kind === 'text' && extracted.format === 'html' && extracted.text.includes('/content/enforced/')) {
    notes.push('[Linked course files can be read with get_course_file(course_id, path).]');
  }
  const blocks = extractedToMcpContent(extracted, { notes });
  const header = { type: 'text' as const, text: `File: ${file.path.filename} (${file.path.path})` };
  return { content: [header, ...blocks] };
}
