import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import { registerWeeklyBriefingPrompt } from './weekly-briefing.prompt.js';
import { registerGradeAuditPrompt } from './grade-audit.prompt.js';
import { registerStudyPlannerPrompt } from './study-planner.prompt.js';
import { registerCourseSummaryPrompt } from './course-summary.prompt.js';

export interface PromptDeps {
  courseRepo: CourseRepository;
  output: OutputContext;
}

export function registerAllPrompts(server: McpServer, deps: PromptDeps): void {
  registerWeeklyBriefingPrompt(server, deps);
  registerGradeAuditPrompt(server, deps);
  registerStudyPlannerPrompt(server, deps);
  registerCourseSummaryPrompt(server, deps);
}
