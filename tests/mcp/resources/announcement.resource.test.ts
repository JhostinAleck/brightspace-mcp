/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnnouncementResource } from '@/mcp/resources/announcement.resource.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

function makeServer() { return new McpServer({ name: 'test', version: '0.0.0' }); }

const mockAnnouncements = [{
  id: 456,
  courseOrgUnitId: 123,
  title: 'Parcial 1 — instrucciones',
  html: '<p>El parcial será el viernes a las 9am.</p>',
  authorName: 'Prof. García',
  postedAt: new Date('2026-05-01T10:00:00Z'),
}];

describe('announcement.resource', () => {
  it('returns plain text with stripped HTML', async () => {
    const communicationsRepo = { findAnnouncements: vi.fn().mockResolvedValue(mockAnnouncements) } as any;
    const server = makeServer();
    registerAnnouncementResource(server, { communicationsRepo, output: testOutputContext() });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-announcement'];
    const result = await registered.readCallback(
      new URL('brightspace://123/announcements/456'), { courseId: '123', announcementId: '456' }, {},
    );
    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('Parcial 1');
    expect(result.contents[0].text).not.toContain('<p>');
    expect(result.contents[0].text).toContain('Prof. García');
  });

  it('throws when announcement not found', async () => {
    const communicationsRepo = { findAnnouncements: vi.fn().mockResolvedValue([]) } as any;
    const server = makeServer();
    registerAnnouncementResource(server, { communicationsRepo, output: testOutputContext() });
    const templates = (server as any)._registeredResourceTemplates as Record<string, any>;
    const registered = templates?.['brightspace-announcement'];
    await expect(
      registered.readCallback(new URL('brightspace://123/announcements/999'), { courseId: '123', announcementId: '999' }, {}),
    ).rejects.toThrow('not found');
  });
});
