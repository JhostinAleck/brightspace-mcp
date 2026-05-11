import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import { getRoster } from '@/contexts/courses/application/getRoster.js';
import { getRosterSchema } from '@/mcp/schemas.js';
import { rosterToText } from '@/mcp/tool-helpers.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetRosterDeps { courseRepo: CourseRepository; output: OutputContext; }

export async function handleGetRoster(deps: GetRosterDeps, rawInput: unknown) {
  const input = getRosterSchema.parse(rawInput);
  const all = await getRoster({ repo: deps.courseRepo, courseId: CourseId.of(input.course_id) });
  const filtered = input.role_filter === 'all' ? all : all.filter((c) => c.role === input.role_filter);
  return { content: [{ type: 'text' as const, text: rosterToText(filtered, deps.output) }] };
}
