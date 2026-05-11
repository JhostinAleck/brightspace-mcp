import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import { z } from 'zod';

export interface StudyPlannerPromptDeps {
  output: OutputContext;
}

export function registerStudyPlannerPrompt(server: McpServer, deps: StudyPlannerPromptDeps): void {
  server.registerPrompt(
    'study_planner',
    {
      description: deps.output.t('prompts.study_planner.description', { days: 7 }),
      argsSchema: {
        days_ahead: z.number().int().positive().max(30).default(7),
      },
    },
    async (args) => ({
      messages: [{
        role: 'user' as const,
        content: { type: 'text' as const, text: deps.output.t('prompts.study_planner.message', { days: args.days_ahead }) },
      }],
    }),
  );
}
