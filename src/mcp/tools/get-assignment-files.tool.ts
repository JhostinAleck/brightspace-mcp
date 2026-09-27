import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import { getAssignmentFilesSchema } from '@/mcp/schemas.js';
import { expandPath } from '@/shared-kernel/path/expandPath.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import { extractFileContent, extractedToText } from '@/shared-kernel/extract/extractFileContent.js';

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

async function topicToText(buf: Buffer, title: string, ext: string | null): Promise<string> {
  return extractedToText(await extractFileContent(buf, { filename: `${title}${ext ?? ''}` }));
}

/**
 * Attachment names come from D2L (sometimes scraped from HTML), so they are
 * untrusted: keep only the final path segment so a save never escapes save_to.
 */
function safeFileName(name: string): string {
  const base = basename(name.replace(/\\/g, '/')).replace(/^\.+$/, '');
  return base || 'attachment';
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

  // Resolve save_to once. Folder is created on first save.
  const saveDir = input.save_to ? resolve(expandPath(input.save_to)) : null;
  if (saveDir) mkdirSync(saveDir, { recursive: true });

  if (result.files.length > 0) {
    lines.push(`\n## Attachments (${result.files.length})`);
    for (const f of result.files) {
      lines.push(`\n### ${f.name}`);
      const content = result.fileContents[f.name];
      if (content) lines.push(content);
      if (saveDir) {
        try {
          const bin = await deps.assignmentRepo.findFileBinary(courseId, f);
          const out = join(saveDir, safeFileName(f.name));
          writeFileSync(out, bin);
          lines.push(`[Saved to: ${out}]`);
        } catch (err) {
          lines.push(`[Save failed: ${(err as Error).message}]`);
        }
      }
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
            return { topic, body: await topicToText(buf, topic.title, topic.ext), buf };
          } catch {
            return { topic, body: '[download failed]', buf: null as Buffer | null };
          }
        }),
      );
      for (const { topic, body, buf } of fetched) {
        lines.push(`\n### ${topic.title}`);
        lines.push(body);
        if (saveDir && buf) {
          // Use topic title + extension; sanitize slashes from the title.
          const safe = safeFileName(topic.title.replace(/[/\\]/g, '_') + (topic.ext ?? ''));
          try {
            const out = join(saveDir, safe);
            writeFileSync(out, buf);
            lines.push(`[Saved to: ${out}]`);
          } catch (err) {
            lines.push(`[Save failed: ${(err as Error).message}]`);
          }
        }
      }
    }
  }

  return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
}
