/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

function makeServer() { return new McpServer({ name: 'test', version: '0.0.0' }); }

describe('content-topic.resource', () => {
  it('returns text/plain for readable PDF', async () => {
    vi.doMock('pdf-parse', () => ({ default: () => Promise.resolve({ text: 'Long enough extracted text from PDF that exceeds fifty characters easily.' }) }));
    const { registerContentTopicResource: reg } = await import('@/mcp/resources/content-topic.resource.js');
    const contentRepo = { findTopicFile: vi.fn().mockResolvedValue(Buffer.from('%PDF-fake')) } as any;
    const server = makeServer();
    reg(server, { contentRepo });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-content-topic'];
    const result = await registered.readCallback(new URL('brightspace://1/content/topics/2'), { courseId: '1', topicId: '2' }, {});
    expect(result.contents[0].mimeType).toBe('text/plain');
  });

  it('returns base64 fallback when text too short', async () => {
    vi.doMock('pdf-parse', () => ({ default: () => Promise.resolve({ text: 'short' }) }));
    const { registerContentTopicResource: reg } = await import('@/mcp/resources/content-topic.resource.js');
    const buf = Buffer.from('%PDF-small');
    const contentRepo = { findTopicFile: vi.fn().mockResolvedValue(buf) } as any;
    const server = makeServer();
    reg(server, { contentRepo });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-content-topic'];
    const result = await registered.readCallback(new URL('brightspace://1/content/topics/3'), { courseId: '1', topicId: '3' }, {});
    expect(result.contents).toHaveLength(2);
    expect(result.contents[1].mimeType).toBe('application/pdf');
  });

  it('throws on invalid variables', async () => {
    const { registerContentTopicResource: reg } = await import('@/mcp/resources/content-topic.resource.js');
    const contentRepo = { findTopicFile: vi.fn() } as any;
    const server = makeServer();
    reg(server, { contentRepo });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-content-topic'];
    await expect(registered.readCallback(new URL('brightspace://abc/content/topics/2'), { courseId: 'abc', topicId: '2' }, {})).rejects.toThrow();
  });
});
