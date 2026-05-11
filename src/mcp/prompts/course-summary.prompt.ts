import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import { z } from 'zod';

export interface CourseSummaryPromptDeps {
  courseRepo: CourseRepository;
  output: OutputContext;
}

export function registerCourseSummaryPrompt(server: McpServer, deps: CourseSummaryPromptDeps): void {
  server.registerPrompt(
    'course_summary',
    {
      description: deps.output.t('prompts.course_summary.description'),
      argsSchema: {
        course_id: z.number().int().positive(),
      },
    },
    async (args) => {
      const course = await deps.courseRepo.findById(CourseId.of(args.course_id));
      const name = course?.name ?? `course ${args.course_id}`;
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: deps.output.t('prompts.course_summary.message', { courseName: name, courseId: args.course_id }),
          },
        }],
      };
    },
  );
}
