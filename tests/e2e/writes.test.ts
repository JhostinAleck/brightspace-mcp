import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startMockD2l } from './mock-d2l.js';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('E2E writes against mock D2L (writes enabled)', () => {
  let mock: Awaited<ReturnType<typeof startMockD2l>>;
  let client: Client;

  beforeAll(async () => {
    mock = await startMockD2l();
    const configDir = mkdtempSync(join(tmpdir(), 'bsmcp-writes-'));
    const configPath = join(configDir, 'config.yaml');
    writeFileSync(
      configPath,
      `default_profile: w
profiles:
  w:
    base_url: ${mock.url}
    auth:
      strategy: api_token
      api_token: { token_ref: env:W_TOK }
writes:
  enabled: true
  dry_run: false
`,
      'utf8',
    );
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['build/cli/main.js', 'serve', '--config', configPath, '--enable-writes'],
      env: {
        ...process.env,
        W_TOK: 'tok',
        BRIGHTSPACE_ALLOW_HTTP_LOCALHOST: '1',
      } as Record<string, string>,
    });
    client = new Client({ name: 'writes-smoke', version: '0' }, {});
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
    await mock?.close();
  });

  it('exposes submit_assignment tool when writes are enabled', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain('submit_assignment');
    expect(names).toContain('post_discussion_reply');
    expect(names).toContain('mark_announcement_read');
  });

  it('submit_assignment returns the mock submission id', async () => {
    const result = await client.callTool({
      name: 'submit_assignment',
      arguments: {
        course_id: '100',
        folder_id: 'folder-1',
        filename: 'hw.txt',
        content_base64: Buffer.from('hello').toString('base64'),
        idempotency_key: 'e2e-test-key-1234',
      },
    });
    const text = ((result.content as Array<{ text: string }>)[0])?.text ?? '';
    expect(text).toContain('sub-e2e');
  });

  it('idempotency key replays the same response', async () => {
    const args = {
      course_id: '100',
      folder_id: 'folder-1',
      filename: 'hw.txt',
      content_base64: Buffer.from('world').toString('base64'),
      idempotency_key: 'e2e-replay-key-5678',
    };
    const r1 = await client.callTool({ name: 'submit_assignment', arguments: args });
    const r2 = await client.callTool({ name: 'submit_assignment', arguments: args });
    const t1 = ((r1.content as Array<{ text: string }>)[0])?.text ?? '';
    const t2 = ((r2.content as Array<{ text: string }>)[0])?.text ?? '';
    expect(t2).toContain('replay');
    expect(t1).toContain('sub-e2e');
    expect(t2).toContain('sub-e2e');
  });
});

describe('E2E writes gated OFF (no --enable-writes flag)', () => {
  let mock: Awaited<ReturnType<typeof startMockD2l>>;
  let client: Client;

  beforeAll(async () => {
    mock = await startMockD2l();
    const configDir = mkdtempSync(join(tmpdir(), 'bsmcp-writes-off-'));
    const configPath = join(configDir, 'config.yaml');
    // writes.enabled still true in config but NO --enable-writes CLI flag
    writeFileSync(
      configPath,
      `default_profile: w
profiles:
  w:
    base_url: ${mock.url}
    auth:
      strategy: api_token
      api_token: { token_ref: env:W_TOK }
writes:
  enabled: true
`,
      'utf8',
    );
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['build/cli/main.js', 'serve', '--config', configPath], // NO --enable-writes
      env: {
        ...process.env,
        W_TOK: 'tok',
        BRIGHTSPACE_ALLOW_HTTP_LOCALHOST: '1',
      } as Record<string, string>,
    });
    client = new Client({ name: 'writes-off', version: '0' }, {});
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
    await mock?.close();
  });

  it('does NOT expose write tools when --enable-writes is missing', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).not.toContain('submit_assignment');
    expect(names).not.toContain('post_discussion_reply');
    expect(names).not.toContain('mark_announcement_read');
  });
});
