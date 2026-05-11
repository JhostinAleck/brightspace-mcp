import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
export interface ContentTopicResourceDeps { contentRepo: ContentRepository }
export function registerContentTopicResource(_server: McpServer, _deps: ContentTopicResourceDeps): void {}
