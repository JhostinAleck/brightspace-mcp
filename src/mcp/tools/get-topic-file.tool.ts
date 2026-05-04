import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { getTopicFileSchema } from '@/mcp/schemas.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { inflateRawSync } from 'node:zlib';

export interface GetTopicFileDeps { contentRepo: ContentRepository; }

function extractZipEntry(buf: Buffer, target: string): string | null {
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

function bufToText(buf: Buffer, contentType: string): string {
  if (contentType.includes('pdf')) return `[PDF — ${buf.length} bytes]`;
  if (contentType.includes('wordprocessingml') || contentType.includes('docx')) {
    try {
      const xml = extractZipEntry(buf, 'word/document.xml');
      if (!xml) return '[DOCX: could not read content]';
      return xml
        .replace(/<w:br[^>]*/g, '\n').replace(/<w:p[ >][^>]*>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#xA;/g, '\n')
        .replace(/\n{3,}/g, '\n\n').trim();
    } catch { return '[DOCX: extraction failed]'; }
  }
  if (contentType.includes('text') || contentType.includes('html')) return buf.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  return `[${contentType} — ${buf.length} bytes]`;
}

export async function handleGetTopicFile(deps: GetTopicFileDeps, rawInput: unknown) {
  const input = getTopicFileSchema.parse(rawInput);
  const courseId = OrgUnitId.of(input.course_id);
  const buf = await deps.contentRepo.findTopicFile(courseId, input.topic_id);

  // Detect content type from magic bytes
  let contentType = 'application/octet-stream';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) contentType = 'application/pdf';
  else if (buf[0] === 0x50 && buf[1] === 0x4B) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else if (buf.slice(0, 5).toString() === '<?xml' || buf.slice(0, 14).toString().includes('html')) contentType = 'text/html';

  const text = bufToText(buf, contentType);
  return { content: [{ type: 'text' as const, text }] };
}
