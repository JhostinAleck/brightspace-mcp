import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import { buildSyllabusUri } from './uri-builder.js';

export interface SyllabusResourceDeps {
  contentRepo: ContentRepository;
  output: OutputContext;
}

export function registerSyllabusResource(server: McpServer, deps: SyllabusResourceDeps): void {
  const template = new ResourceTemplate('brightspace://{courseId}/syllabus', { list: undefined });
  server.registerResource(
    'brightspace-syllabus',
    template,
    {
      description: 'Course syllabus from Brightspace. URI pattern: brightspace://{courseId}/syllabus',
      mimeType: 'text/plain',
    },
    async (_uri, variables) => {
      const courseId = parseInt(String(variables['courseId']), 10);
      if (!Number.isFinite(courseId) || courseId <= 0) {
        throw new Error(`Invalid courseId: ${String(variables['courseId'])}`);
      }
      const syllabus = await deps.contentRepo.findSyllabus(OrgUnitId.of(courseId));
      if (!syllabus) {
        throw new Error(`Syllabus not found for course ${courseId}`);
      }
      const stripped = (syllabus.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const updated = syllabus.updatedAt
        ? `Updated: ${deps.output.formatDate(syllabus.updatedAt)}\n\n`
        : '';
      return {
        contents: [{
          uri: buildSyllabusUri(courseId),
          mimeType: 'text/plain',
          text: `${syllabus.title}\n${updated}${stripped}`,
        }],
      };
    },
  );
}
