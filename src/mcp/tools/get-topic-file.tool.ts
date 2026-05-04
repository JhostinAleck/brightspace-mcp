import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { getTopicFileSchema } from '@/mcp/schemas.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { inflateRawSync } from 'node:zlib';
import { PDFParse } from 'pdf-parse';

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
  if (contentType.includes('spreadsheetml')) return `[Excel — ${buf.length} bytes]`;
  if (contentType.includes('presentationml')) return `[PowerPoint — ${buf.length} bytes]`;
  if (contentType.includes('zip')) return `[ZIP — ${buf.length} bytes]`;
  if (contentType.includes('text') || contentType.includes('html')) return buf.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  return `[${contentType} — ${buf.length} bytes]`;
}

function detectContentType(buf: Buffer): string {
  if (buf.length < 4) return 'application/octet-stream';
  // PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  // ZIP-based (DOCX, XLSX, PPTX) — differentiate by internal entry names
  if (buf[0] === 0x50 && buf[1] === 0x4B) {
    const header = buf.slice(0, Math.min(buf.length, 200)).toString('latin1');
    if (header.includes('word/')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (header.includes('xl/')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (header.includes('ppt/')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    return 'application/zip';
  }
  // HTML / XML — check first 512 bytes as text
  const head = buf.slice(0, 512).toString('utf8');
  if (head.includes('<!DOCTYPE') || head.includes('<html') || head.includes('<?xml')) return 'text/html';
  // Heuristic: if all bytes are printable ASCII or common UTF-8 control chars, treat as text
  const sample = buf.slice(0, 256);
  const printable = [...sample].filter(b => b >= 0x09 && b <= 0x7E).length;
  if (printable / sample.length > 0.85) return 'text/plain';
  return 'application/octet-stream';
}

export async function handleGetTopicFile(deps: GetTopicFileDeps, rawInput: unknown) {
  const input = getTopicFileSchema.parse(rawInput);
  const courseId = OrgUnitId.of(input.course_id);
  const buf = await deps.contentRepo.findTopicFile(courseId, input.topic_id);

  const contentType = detectContentType(buf);

  // For PDFs: extract text directly from the binary
  if (contentType === 'application/pdf') {
    try {
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      await parser.destroy();
      const text = result.text.replace(/\s+/g, ' ').trim().slice(0, 12000);
      if (text) return { content: [{ type: 'text' as const, text }] };
    } catch { /* fall through to size report */ }
    return { content: [{ type: 'text' as const, text: `[PDF — ${buf.length} bytes, text extraction failed]` }] };
  }

  // For unrecognized binary (D2L internal format), fall back to Playwright-rendered view URL
  if (contentType === 'application/octet-stream') {
    const rendered = await deps.contentRepo.findTopicRenderedText(courseId, input.topic_id);
    if (rendered) return { content: [{ type: 'text' as const, text: rendered }] };
  }

  const text = bufToText(buf, contentType);
  return { content: [{ type: 'text' as const, text }] };
}
