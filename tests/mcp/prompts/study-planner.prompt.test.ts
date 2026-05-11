/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerStudyPlannerPrompt } from '@/mcp/prompts/study-planner.prompt.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

function makeServer() { return new McpServer({ name: 'test', version: '0.0.0' }); }

describe('study_planner prompt', () => {
  it('uses default days=7', async () => {
    const server = makeServer();
    registerStudyPlannerPrompt(server, { output: testOutputContext({ locale: 'en-US' }) });
    const registered = (server as any)._registeredPrompts?.['study_planner'];
    const result = await registered.callback({ days_ahead: 7 }, {});
    expect(result.messages[0].content.text).toContain('7');
    expect(result.messages[0].content.text).toContain('get_upcoming_due_dates');
  });

  it('interpolates custom days', async () => {
    const server = makeServer();
    registerStudyPlannerPrompt(server, { output: testOutputContext({ locale: 'en-US' }) });
    const registered = (server as any)._registeredPrompts?.['study_planner'];
    const result = await registered.callback({ days_ahead: 14 }, {});
    expect(result.messages[0].content.text).toContain('14');
  });
});
