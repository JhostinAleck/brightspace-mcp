import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { ExtractedContent } from '@/shared-kernel/extract/extractFileContent.js';
import { expandPath } from '@/shared-kernel/path/expandPath.js';

export type McpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface RenderOptions {
  /** Extra lines appended after the content (e.g. "[Saved to: …]"). */
  notes?: string[];
}

/** Write raw bytes to a user-supplied path (`~/…`, `%VAR%\…`, absolute). */
export function saveBufferToDisk(buf: Buffer, rawPath: string): string {
  const abs = resolve(expandPath(rawPath));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, buf);
  return abs;
}

/**
 * Convert extracted file content into MCP tool-result blocks: text (with an
 * explicit truncation notice), an `image` block for pictures, or a one-line
 * description for media/binaries. Shared by every tool that downloads files.
 */
export function extractedToMcpContent(x: ExtractedContent, opts: RenderOptions = {}): McpContentBlock[] {
  const notes = opts.notes ?? [];
  const withNotes = (body: string): string => [body, ...notes].filter(Boolean).join('\n\n');

  if (x.kind === 'image') {
    return [
      { type: 'text', text: withNotes(`[Image — ${x.mimeType}, ${x.bytes} bytes]`) },
      { type: 'image', data: x.base64, mimeType: x.mimeType },
    ];
  }
  if (x.kind === 'binary') {
    const hint = notes.length === 0 ? ' Pass save_to to download the raw file.' : '';
    return [{ type: 'text', text: withNotes(`[${x.format.toUpperCase()} — ${x.mimeType}, ${x.bytes} bytes] ${x.reason}.${hint}`) }];
  }
  const truncation = x.truncated
    ? `[Truncated: showing the first ${x.text.length} of ${x.totalChars} characters. Pass save_to to get the complete file.]`
    : '';
  return [{ type: 'text', text: withNotes([x.text, truncation].filter(Boolean).join('\n\n')) }];
}
