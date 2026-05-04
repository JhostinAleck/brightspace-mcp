import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import { getAssignmentFilesSchema } from '@/mcp/schemas.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';

export interface GetAssignmentFilesDeps {
  assignmentRepo: AssignmentRepository;
  contentRepo: ContentRepository;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface TopicRef { id: number; title: string; ext: string | null }

function collectFileTopics(modules: readonly Module[], out: TopicRef[] = []): TopicRef[] {
  for (const m of modules) {
    for (const t of m.topics) {
      if (t.kind === 'file' || (t.fileExtension !== null)) {
        out.push({ id: t.id, title: t.title, ext: t.fileExtension });
      }
    }
    collectFileTopics(m.submodules, out);
  }
  return out;
}

async function extractDocxText(buf: Buffer): Promise<string> {
  const { inflateRawSync } = await import('node:zlib');
  try {
    const xml = extractZipEntry(buf, 'word/document.xml', inflateRawSync);
    if (!xml) return '[DOCX: could not read content]';
    return xml
      .replace(/<w:br[^>]*/g, '\n')
      .replace(/<w:p[ >][^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#xA;/g, '\n')
      .replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return '[DOCX: extraction failed]';
  }
}

function extractZipEntry(buf: Buffer, target: string, inflateRawSync: (b: Buffer) => Buffer): string | null {
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset+1] !== 0x4B || buf[offset+2] !== 0x03 || buf[offset+3] !== 0x04) {
      offset++;
      continue;
    }
    const compression = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const filenameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const filename = buf.slice(offset + 30, offset + 30 + filenameLen).toString('utf8');
    const dataStart = offset + 30 + filenameLen + extraLen;
    if (filename === target) {
      const data = buf.slice(dataStart, dataStart + compressedSize);
      if (compression === 0) return data.toString('utf8');
      if (compression === 8) return inflateRawSync(data).toString('utf8');
      return null;
    }
    offset = dataStart + compressedSize;
  }
  return null;
}

async function topicToText(buf: Buffer, ext: string | null): Promise<string> {
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
    lines.push('\n## Instrucciones\n' + result.instructions);
  }

  if (result.files.length > 0) {
    lines.push(`\n## Archivos adjuntos (${result.files.length})`);
    for (const f of result.files) {
      lines.push(`\n### ${f.name}`);
      const content = result.fileContents[f.name];
      if (content) lines.push(content);
    }
  } else {
    // Fallback: search course content for topics matching the assignment name
    const modules = await deps.contentRepo.findModules(courseId);
    const allTopics = collectFileTopics(modules);
    const needle = normalize(result.assignmentName);
    const matches = allTopics.filter(t => {
      const hay = normalize(t.title);
      return hay.includes(needle) || needle.includes(hay);
    });

    if (matches.length === 0) {
      lines.push('\nNo hay archivos adjuntos en el dropbox ni en el contenido del curso.');
    } else {
      lines.push(`\n## Archivos en contenido del curso (${matches.length})`);
      for (const topic of matches) {
        lines.push(`\n### ${topic.title}`);
        try {
          const buf = await deps.contentRepo.findTopicFile(courseId, topic.id);
          lines.push(await topicToText(buf, topic.ext));
        } catch {
          lines.push('[error al descargar el archivo]');
        }
      }
    }
  }

  return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
}
