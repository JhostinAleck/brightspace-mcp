/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWeeklyBriefingPrompt } from '@/mcp/prompts/weekly-briefing.prompt.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

function makeServer() { return new McpServer({ name: 'test', version: '0.0.0' }); }

describe('weekly_briefing prompt', () => {
  it('registers with correct name', () => {
    const server = makeServer();
    registerWeeklyBriefingPrompt(server, { output: testOutputContext() });
    const registered = (server as any)._registeredPrompts?.['weekly_briefing'];
    expect(registered).toBeDefined();
  });

  it('returns user message mentioning get_upcoming_due_dates (en-US)', async () => {
    const server = makeServer();
    registerWeeklyBriefingPrompt(server, { output: testOutputContext({ locale: 'en-US' }) });
    const registered = (server as any)._registeredPrompts?.['weekly_briefing'];
    const result = await registered.callback({}, {});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content.text).toContain('get_upcoming_due_dates');
  });

  it('returns localised message in es-419', async () => {
    const server = makeServer();
    registerWeeklyBriefingPrompt(server, { output: testOutputContext({ locale: 'es-419' }) });
    const registered = (server as any)._registeredPrompts?.['weekly_briefing'];
    const result = await registered.callback({}, {});
    expect(result.messages[0].content.text).toContain('resumen semanal');
  });
});
