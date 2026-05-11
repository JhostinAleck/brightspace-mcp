import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
export interface AssignmentFilesResourceDeps { assignmentRepo: AssignmentRepository }
export function registerAssignmentFilesResource(_server: McpServer, _deps: AssignmentFilesResourceDeps): void {}
