import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startMockD2l } from './mock-d2l.js';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// NOTE: The D2lApiClient rejects http:// URLs by design. This test spawns a
// mock D2L server on 127.0.0.1 over HTTP, so it currently cannot run without
// weakening that production guardrail. Plan 3 will introduce a proper
// transport abstraction that allows HTTP in test contexts. Until then, this
// test is skipped but kept as a scaffold and documentation of the intended
// end-to-end path.

describe.skip('E2E smoke: list_my_courses against mock D2L', () => {
  let mock: Awaited<ReturnType<typeof startMockD2l>>;
  let client: Client;

  beforeAll(async () => {
    mock = await startMockD2l();
    const configDir = mkdtempSync(join(tmpdir(), 'bsmcp-'));
    writeFileSync(
      join(configDir, 'config.yaml'),
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
      args: ['build/cli/main.js', '--config', join(configDir, 'config.yaml')],
      env: { ...process.env, SMOKE_TOK: 'tok_test' } as Record<string, string>,
    });
    client = new Client({ name: 'smoke', version: '0' }, {});
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    await mock?.close();
  });

  it('lists the single smoke course', async () => {
    const r = await client.callTool({ name: 'list_my_courses', arguments: {} });
    const text = (r.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toContain('Smoke 101');
  });
});
