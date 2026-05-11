import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import { z } from 'zod';

export interface GradeAuditPromptDeps {
  courseRepo: CourseRepository;
  output: OutputContext;
}

export function registerGradeAuditPrompt(server: McpServer, deps: GradeAuditPromptDeps): void {
  server.registerPrompt(
    'grade_audit',
    {
      description: deps.output.t('prompts.grade_audit.description'),
      argsSchema: {
        course_id: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      let text: string;
      if (args.course_id !== undefined) {
        const course = await deps.courseRepo.findById(CourseId.of(args.course_id));
        const name = course?.name ?? `course ${args.course_id}`;
        text = deps.output.t('prompts.grade_audit.message_course', { courseName: name, courseId: args.course_id });
      } else {
        text = deps.output.t('prompts.grade_audit.message_all');
      }
      return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
    },
  );
}
