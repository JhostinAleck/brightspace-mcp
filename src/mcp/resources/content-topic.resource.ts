import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { buildContentTopicUri } from './uri-builder.js';
import { extractTextFromBuffer } from './pdf-extractor.js';

export interface ContentTopicResourceDeps {
  contentRepo: ContentRepository;
}

export function registerContentTopicResource(server: McpServer, deps: ContentTopicResourceDeps): void {
  const template = new ResourceTemplate('brightspace://{courseId}/content/topics/{topicId}', { list: undefined });
  server.registerResource(
    'brightspace-content-topic',
    template,
    { description: 'Course content topic file. URI: brightspace://{courseId}/content/topics/{topicId}' },
    async (_uri, variables) => {
      const courseId = parseInt(String(variables['courseId']), 10);
      const topicId = parseInt(String(variables['topicId']), 10);
      if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(topicId) || topicId <= 0) {
        throw new Error(`Invalid variables: courseId=${String(variables['courseId'])}, topicId=${String(variables['topicId'])}`);
      }
      const buffer = await deps.contentRepo.findTopicFile(OrgUnitId.of(courseId), topicId);
      return extractTextFromBuffer(buffer, buildContentTopicUri(courseId, topicId));
    },
  );
}
