import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
export interface AnnouncementResourceDeps { communicationsRepo: CommunicationsRepository; output: OutputContext }
export function registerAnnouncementResource(_server: McpServer, _deps: AnnouncementResourceDeps): void {}
