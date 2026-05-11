import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import { buildAnnouncementUri } from './uri-builder.js';

export interface AnnouncementResourceDeps {
  communicationsRepo: CommunicationsRepository;
  output: OutputContext;
}

export function registerAnnouncementResource(server: McpServer, deps: AnnouncementResourceDeps): void {
  const template = new ResourceTemplate('brightspace://{courseId}/announcements/{announcementId}', { list: undefined });
  server.registerResource(
    'brightspace-announcement',
    template,
    { description: 'Course announcement. URI: brightspace://{courseId}/announcements/{announcementId}', mimeType: 'text/plain' },
    async (_uri, variables) => {
      const courseId = parseInt(String(variables['courseId']), 10);
      const announcementId = String(variables['announcementId']);
      if (!Number.isFinite(courseId) || courseId <= 0 || !announcementId) {
        throw new Error(`Invalid resource variables`);
      }
      const all = await deps.communicationsRepo.findAnnouncements(OrgUnitId.of(courseId));
      const ann = all.find((a) => String(a.id) === announcementId);
      if (!ann) {
        throw new Error(`Announcement ${announcementId} not found in course ${courseId}`);
      }
      const body = (ann.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const author = ann.authorName ? `${ann.authorName} · ` : '';
      const date = deps.output.formatDate(ann.postedAt);
      return {
        contents: [{
          uri: buildAnnouncementUri(courseId, announcementId),
          mimeType: 'text/plain',
          text: `${ann.title}\n${author}${date}\n\n${body}`,
        }],
      };
    },
  );
}
