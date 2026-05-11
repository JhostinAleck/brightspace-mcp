import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface WeeklyBriefingPromptDeps {
  output: OutputContext;
}

export function registerWeeklyBriefingPrompt(server: McpServer, deps: WeeklyBriefingPromptDeps): void {
  server.registerPrompt(
    'weekly_briefing',
    {
      description: deps.output.t('prompts.weekly_briefing.description'),
      argsSchema: {},
    },
    async () => ({
      messages: [{
        role: 'user' as const,
        content: { type: 'text' as const, text: deps.output.t('prompts.weekly_briefing.message') },
      }],
    }),
  );
}
