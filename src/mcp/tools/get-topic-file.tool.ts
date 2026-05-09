import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { getTopicFileSchema } from '@/mcp/schemas.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { extractDocxText, extractXlsxText } from '@/shared-kernel/zip/extractZipEntry.js';
import { PDFParse } from 'pdf-parse';

export interface GetTopicFileDeps { contentRepo: ContentRepository; }

function bufToText(buf: Buffer, contentType: string): string {
  if (contentType.includes('pdf')) return `[PDF — ${buf.length} bytes]`;
  if (contentType.includes('wordprocessingml') || contentType.includes('docx')) {
    return extractDocxText(buf);
  }
  if (contentType.includes('spreadsheetml')) return extractXlsxText(buf);
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

function saveToDisk(buf: Buffer, rawPath: string): string {
  const expanded = rawPath.startsWith('~')
    ? rawPath.replace(/^~/, homedir())
    : rawPath;
  const abs = resolve(expanded);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, buf);
  return abs;
}

export async function handleGetTopicFile(deps: GetTopicFileDeps, rawInput: unknown) {
  const input = getTopicFileSchema.parse(rawInput);
  const courseId = OrgUnitId.of(input.course_id);
  const buf = await deps.contentRepo.findTopicFile(courseId, input.topic_id);

  const savedNote = input.save_to
    ? `\n\n[Saved to: ${saveToDisk(buf, input.save_to)}]`
    : '';

  const contentType = detectContentType(buf);

  // For PDFs: extract text directly from the binary
  if (contentType === 'application/pdf') {
    try {
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      await parser.destroy();
      const text = result.text.replace(/\s+/g, ' ').trim().slice(0, 12000);
      if (text) return { content: [{ type: 'text' as const, text: text + savedNote }] };
    } catch { /* fall through to size report */ }
    return { content: [{ type: 'text' as const, text: `[PDF — ${buf.length} bytes, text extraction failed]${savedNote}` }] };
  }

  // For unrecognized binary (D2L internal format), fall back to Playwright-rendered view URL
  if (contentType === 'application/octet-stream') {
    const rendered = await deps.contentRepo.findTopicRenderedText(courseId, input.topic_id);
    if (rendered) return { content: [{ type: 'text' as const, text: rendered + savedNote }] };
  }

  const text = bufToText(buf, contentType);
  return { content: [{ type: 'text' as const, text: text + savedNote }] };
}
