/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

function makeServer() { return new McpServer({ name: 'test', version: '0.0.0' }); }

describe('assignment-files.resource', () => {
  it('returns text for files', async () => {
    vi.doMock('pdf-parse', () => ({ default: () => Promise.resolve({ text: 'Assignment instructions that are long enough to exceed fifty characters for the test.' }) }));
    const { registerAssignmentFilesResource } = await import('@/mcp/resources/assignment-files.resource.js');
    const fakeBuf = Buffer.from('%PDF-fake');
    const assignmentRepo = {
      findFiles: vi.fn().mockResolvedValue({ assignmentId: '10', assignmentName: 'T1', instructions: '', files: [{ name: 'enunciado.pdf', url: 'https://d2l.example.com/f' }], fileContents: {} }),
      findFileBinary: vi.fn().mockResolvedValue(fakeBuf),
    } as any;
    const server = makeServer();
    registerAssignmentFilesResource(server, { assignmentRepo });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-assignment-files'];
    const result = await registered.readCallback(new URL('brightspace://1/assignments/10/files'), { courseId: '1', assignmentId: '10' }, {});
    expect(result.contents.length).toBeGreaterThan(0);
    expect(result.contents[0].mimeType).toBe('text/plain');
  });

  it('returns no-files message when empty', async () => {
    const { registerAssignmentFilesResource } = await import('@/mcp/resources/assignment-files.resource.js');
    const assignmentRepo = {
      findFiles: vi.fn().mockResolvedValue({ assignmentId: '10', assignmentName: 'T1', instructions: '', files: [], fileContents: {} }),
      findFileBinary: vi.fn(),
    } as any;
    const server = makeServer();
    registerAssignmentFilesResource(server, { assignmentRepo });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-assignment-files'];
    const result = await registered.readCallback(new URL('brightspace://1/assignments/10/files'), { courseId: '1', assignmentId: '10' }, {});
    expect(result.contents[0].text).toContain('No files');
  });
});
