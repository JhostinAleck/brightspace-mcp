import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import { registerSyllabusResource } from './syllabus.resource.js';
import { registerContentTopicResource } from './content-topic.resource.js';
import { registerAnnouncementResource } from './announcement.resource.js';
import { registerAssignmentFilesResource } from './assignment-files.resource.js';

export interface ResourceDeps {
  contentRepo: ContentRepository;
  communicationsRepo: CommunicationsRepository;
  assignmentRepo: AssignmentRepository;
  output: OutputContext;
}

export function registerAllResources(server: McpServer, deps: ResourceDeps): void {
  registerSyllabusResource(server, deps);
  registerContentTopicResource(server, deps);
  registerAnnouncementResource(server, deps);
  registerAssignmentFilesResource(server, deps);
}
