import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import { getClasslistEmails } from '@/contexts/courses/application/getClasslistEmails.js';
import { getClasslistEmailsSchema } from '@/mcp/schemas.js';
import { emailsToText } from '@/mcp/tool-helpers.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';

export interface GetClasslistEmailsDeps { courseRepo: CourseRepository; }

export async function handleGetClasslistEmails(deps: GetClasslistEmailsDeps, rawInput: unknown) {
  const input = getClasslistEmailsSchema.parse(rawInput);
  const emails = await getClasslistEmails({ repo: deps.courseRepo, courseId: CourseId.of(input.course_id) });
  return { content: [{ type: 'text' as const, text: emailsToText(emails) }] };
}
