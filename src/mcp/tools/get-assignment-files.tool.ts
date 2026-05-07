import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import { getAssignmentFilesSchema } from '@/mcp/schemas.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import { extractDocxText } from '@/shared-kernel/zip/extractZipEntry.js';

export interface GetAssignmentFilesDeps {
  assignmentRepo: AssignmentRepository;
  contentRepo: ContentRepository;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface TopicRef { id: number; title: string; ext: string | null }

function collectAllTopics(modules: readonly Module[], out: TopicRef[] = []): TopicRef[] {
  for (const m of modules) {
    for (const t of m.topics) {
      out.push({ id: t.id, title: t.title, ext: t.fileExtension });
    }
    collectAllTopics(m.submodules, out);
  }
  return out;
}

function topicToText(buf: Buffer, ext: string | null): string {
  const e = (ext ?? '').toLowerCase().replace('.', '');
  if (e === 'docx') return extractDocxText(buf);
  return `[${e.toUpperCase() || 'binary'} — ${buf.length} bytes]`;
}

export async function handleGetAssignmentFiles(deps: GetAssignmentFilesDeps, rawInput: unknown) {
  const input = getAssignmentFilesSchema.parse(rawInput);
  const courseId = OrgUnitId.of(input.course_id);
  const result = await deps.assignmentRepo.findFiles(
    courseId,
    AssignmentId.of(input.assignment_id),
  );

  const lines: string[] = [];
  lines.push(`# ${result.assignmentName}`);
  if (result.instructions) {
    lines.push('\n## Instructions\n' + result.instructions);
  }

  if (result.files.length > 0) {
    lines.push(`\n## Attachments (${result.files.length})`);
    for (const f of result.files) {
      lines.push(`\n### ${f.name}`);
      const content = result.fileContents[f.name];
      if (content) lines.push(content);
    }
  } else {
    // Fallback: search course content for topics matching the assignment name
    const modules = await deps.contentRepo.findModules(courseId);
    const allTopics = collectAllTopics(modules);
    const needle = normalize(result.assignmentName);
    const matches = allTopics.filter(t => {
      const hay = normalize(t.title);
      return hay.includes(needle) || needle.includes(hay);
    });

    if (matches.length === 0) {
      lines.push('\nNo attachments found in dropbox or course content.');
    } else {
      lines.push(`\n## Files found in course content (${matches.length})`);
      // Parallel fetch — D2L tolerates concurrent reads under our bulkhead.
      const fetched = await Promise.all(
        matches.map(async (topic) => {
          try {
            const buf = await deps.contentRepo.findTopicFile(courseId, topic.id);
            return { topic, body: topicToText(buf, topic.ext) };
          } catch {
            return { topic, body: '[download failed]' };
          }
        }),
      );
      for (const { topic, body } of fetched) {
        lines.push(`\n### ${topic.title}`);
        lines.push(body);
      }
    }
  }

  return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
}
