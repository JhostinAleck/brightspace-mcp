import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startMockD2l } from './mock-d2l.js';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('E2E smoke: list_my_courses against mock D2L', () => {
  let mock: Awaited<ReturnType<typeof startMockD2l>>;
  let client: Client;
  let configPath: string;

  beforeAll(async () => {
    mock = await startMockD2l();
    const configDir = mkdtempSync(join(tmpdir(), 'bsmcp-e2e-'));
    configPath = join(configDir, 'config.yaml');
    writeFileSync(
      configPath,
      `default_profile: smoke
profiles:
  smoke:
    base_url: ${mock.url}
    auth:
      strategy: api_token
      api_token: { token_ref: env:SMOKE_TOK }
`,
    );
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['build/cli/main.js', '--config', configPath],
      env: {
        ...process.env,
        SMOKE_TOK: 'tok_test',
        BRIGHTSPACE_ALLOW_HTTP_LOCALHOST: '1',
      } as Record<string, string>,
    });
    client = new Client({ name: 'smoke', version: '0' }, {});
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
    await mock?.close();
  });

  it('lists the single smoke course', async () => {
    const r = await client.callTool({ name: 'list_my_courses', arguments: {} });
    const text = ((r.content as Array<{ text: string }>)[0])?.text ?? '';
    expect(text).toContain('Smoke 101');
  });

  it('exposes the new clear_cache tool', async () => {
    const r = await client.callTool({ name: 'clear_cache', arguments: {} });
    const text = ((r.content as Array<{ text: string }>)[0])?.text ?? '';
    expect(text).toMatch(/cleared|no caches/i);
  });

  it('exposes the new get_diagnostics tool', async () => {
    const r = await client.callTool({ name: 'get_diagnostics', arguments: {} });
    const text = ((r.content as Array<{ text: string }>)[0])?.text ?? '';
    const parsed = JSON.parse(text);
    expect(parsed.profile).toBe('smoke');
    expect(parsed.versions.lp).toBe('1.56');
  });

  it('exposes get_my_grades and returns Smoke Exam', async () => {
    const r = await client.callTool({ name: 'get_my_grades', arguments: { course_id: 1 } });
    const text = ((r.content as Array<{ text: string }>)[0])?.text ?? '';
    expect(text).toContain('Smoke Exam');
    expect(text).toContain('92.0%');
  });

  it('exposes get_assignments and lists Smoke Assignment', async () => {
    const r = await client.callTool({ name: 'get_assignments', arguments: { course_id: 1 } });
    const text = ((r.content as Array<{ text: string }>)[0])?.text ?? '';
    expect(text).toContain('Smoke Assignment');
  });

  it('exposes get_roster and lists Test User', async () => {
    const r = await client.callTool({ name: 'get_roster', arguments: { course_id: 1 } });
    const text = ((r.content as Array<{ text: string }>)[0])?.text ?? '';
    expect(text).toContain('Test User');
  });

  it('exposes get_syllabus and returns the overview', async () => {
    const r = await client.callTool({ name: 'get_syllabus', arguments: { course_id: 1 } });
    const text = ((r.content as Array<{ text: string }>)[0])?.text ?? '';
    expect(text).toContain('Smoke syllabus body');
  });

  it('exposes get_announcements and get_calendar_events', async () => {
    const a = await client.callTool({ name: 'get_announcements', arguments: { course_id: 1 } });
    expect(((a.content as Array<{ text: string }>)[0])?.text ?? '').toContain('Smoke Announcement');
    const c = await client.callTool({ name: 'get_calendar_events', arguments: { course_id: 1 } });
    expect(((c.content as Array<{ text: string }>)[0])?.text ?? '').toContain('Smoke Midterm');
  });
});
