import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import { buildAssignmentFilesUri } from './uri-builder.js';
import { extractTextFromBuffer, type ExtractResult } from './pdf-extractor.js';

export interface AssignmentFilesResourceDeps {
  assignmentRepo: AssignmentRepository;
}

export function registerAssignmentFilesResource(server: McpServer, deps: AssignmentFilesResourceDeps): void {
  const template = new ResourceTemplate('brightspace://{courseId}/assignments/{assignmentId}/files', { list: undefined });
  server.registerResource(
    'brightspace-assignment-files',
    template,
    { description: 'Assignment attachment files. URI: brightspace://{courseId}/assignments/{assignmentId}/files' },
    async (_uri, variables) => {
      const courseId = parseInt(String(variables['courseId']), 10);
      const assignmentId = parseInt(String(variables['assignmentId']), 10);
      if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(assignmentId) || assignmentId <= 0) {
        throw new Error(`Invalid variables: courseId=${String(variables['courseId'])}, assignmentId=${String(variables['assignmentId'])}`);
      }
      const resourceUri = buildAssignmentFilesUri(courseId, assignmentId);
      const orgId = OrgUnitId.of(courseId);
      const aid = AssignmentId.of(assignmentId);
      const result = await deps.assignmentRepo.findFiles(orgId, aid);
      if (result.files.length === 0) {
        return { contents: [{ uri: resourceUri, mimeType: 'text/plain', text: 'No files attached to this assignment.' }] };
      }
      const allContents: ExtractResult['contents'] = [];
      for (const file of result.files) {
        const buffer = await deps.assignmentRepo.findFileBinary(orgId, file);
        const fileUri = `${resourceUri}/${encodeURIComponent(file.name)}`;
        const extracted = await extractTextFromBuffer(buffer, fileUri);
        allContents.push(...extracted.contents);
      }
      return { contents: allContents };
    },
  );
}
