/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSyllabusResource } from '@/mcp/resources/syllabus.resource.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

function makeServer() {
  return new McpServer({ name: 'test', version: '0.0.0' });
}

describe('syllabus.resource', () => {
  it('returns plain text with stripped HTML', async () => {
    const mockSyllabus = {
      title: 'Cálculo I',
      html: '<p>Este curso cubre <strong>cálculo</strong> diferencial.</p>',
      updatedAt: new Date('2026-01-10T09:00:00Z'),
      courseOrgUnitId: 123,
      sourceUrl: null,
    };
    const contentRepo = { findSyllabus: vi.fn().mockResolvedValue(mockSyllabus) } as any;
    const server = makeServer();
    registerSyllabusResource(server, { contentRepo, output: testOutputContext() });

    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-syllabus'];
    expect(registered).toBeDefined();
    const result = await registered.readCallback(
      new URL('brightspace://123/syllabus'), { courseId: '123' }, {},
    );
    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('Cálculo I');
    expect(result.contents[0].text).not.toContain('<p>');
    expect(result.contents[0].text).not.toContain('<strong>');
  });

  it('throws when syllabus not found', async () => {
    const contentRepo = { findSyllabus: vi.fn().mockResolvedValue(null) } as any;
    const server = makeServer();
    registerSyllabusResource(server, { contentRepo, output: testOutputContext() });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-syllabus'];
    await expect(
      registered.readCallback(new URL('brightspace://123/syllabus'), { courseId: '123' }, {}),
    ).rejects.toThrow();
  });

  it('throws on invalid courseId', async () => {
    const contentRepo = { findSyllabus: vi.fn() } as any;
    const server = makeServer();
    registerSyllabusResource(server, { contentRepo, output: testOutputContext() });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-syllabus'];
    await expect(
      registered.readCallback(new URL('brightspace://abc/syllabus'), { courseId: 'abc' }, {}),
    ).rejects.toThrow();
  });
});
