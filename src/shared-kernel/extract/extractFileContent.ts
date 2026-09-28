import type { PDFParse } from 'pdf-parse';

import { htmlToText } from '@/shared-kernel/text/htmlLinks.js';
import {
  extractDocxText,
  extractPptxText,
  extractXlsxText,
  listZipEntries,
} from '@/shared-kernel/zip/extractZipEntry.js';

import { detectFileFormat, type FileFormat } from './detectFileFormat.js';

/** Default cap on extracted text returned to the model (characters). */
export const DEFAULT_MAX_CHARS = 40_000;
/** Default cap on images returned inline as base64 (raw bytes). */
export const DEFAULT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface ExtractOptions {
  /**
   * Filename, path or URL of the file. Used as a format hint (extension) and,
   * for HTML, as the base against which relative links are resolved.
   */
  filename?: string | null;
  maxChars?: number;
  maxImageBytes?: number;
}

export type ExtractedContent =
  | {
      kind: 'text';
      format: FileFormat;
      mimeType: string;
      text: string;
      /** True when `text` was cut at `maxChars`. */
      truncated: boolean;
      /** Length of the full extracted text before truncation. */
      totalChars: number;
      bytes: number;
    }
  | { kind: 'image'; format: 'image'; mimeType: string; base64: string; bytes: number }
  | { kind: 'binary'; format: FileFormat; mimeType: string; bytes: number; reason: string };

function decodeUtf8(buf: Buffer): string {
  return buf.toString('utf8').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
}

function tidyLines(s: string): string {
  return s
    .replace(/[ \t\f\v]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function pdfToText(buf: Buffer): Promise<string | null> {
  let parser: PDFParse | null = null;
  try {
    // Loaded on demand: pdfjs throws at import time when its optional canvas
    // binding is missing (`npm i --omit=optional`), which would crash startup.
    const { PDFParse: Parser } = await import('pdf-parse');
    parser = new Parser({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    // pdf-parse separates pages with "-- N of M --" markers; keep them, they help navigation.
    const text = tidyLines(result.text.replace(/[ \t]{2,}/g, ' '));
    return text || null;
  } catch {
    return null;
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

function sourceOf(cell: { source?: unknown }): string {
  const src = cell.source;
  if (Array.isArray(src)) return src.map(String).join('');
  return typeof src === 'string' ? src : '';
}

/** Render a Jupyter notebook as markdown cells + fenced code cells (outputs omitted). */
function notebookToText(raw: string): string | null {
  let nb: unknown;
  try {
    nb = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!nb || typeof nb !== 'object' || !Array.isArray((nb as { cells?: unknown }).cells)) return null;
  const meta = (nb as { metadata?: { kernelspec?: { language?: string }; language_info?: { name?: string } } }).metadata;
  const lang = meta?.kernelspec?.language ?? meta?.language_info?.name ?? 'python';
  const cells = (nb as { cells: Array<{ cell_type?: string; source?: unknown }> }).cells;
  const blocks = cells
    .map((c) => {
      const src = sourceOf(c).replace(/\r\n?/g, '\n').trimEnd();
      if (!src) return '';
      if (c.cell_type === 'code') return `\`\`\`${lang}\n${src}\n\`\`\``;
      return src;
    })
    .filter(Boolean);
  return blocks.join('\n\n');
}

function zipListing(buf: Buffer): string {
  const entries = (listZipEntries(buf) ?? []).filter((e) => !e.endsWith('/'));
  const shown = entries.slice(0, 200);
  const more = entries.length > shown.length ? `\n… and ${entries.length - shown.length} more` : '';
  return `[ZIP archive — ${entries.length} file(s), contents not extracted]\n${shown.join('\n')}${more}`;
}

function textResult(
  format: FileFormat,
  mimeType: string,
  full: string,
  bytes: number,
  maxChars: number,
): ExtractedContent {
  const truncated = full.length > maxChars;
  return {
    kind: 'text',
    format,
    mimeType,
    text: truncated ? full.slice(0, maxChars) : full,
    truncated,
    totalChars: full.length,
    bytes,
  };
}

/**
 * Turn a downloaded course file into something a model can read: text for
 * PDF / DOCX / XLSX(M) / PPTX / HTML / plain text / CSV / JSON / notebooks,
 * base64 for images (below a size cap), and metadata for media or unknown
 * binaries. Plain-text formats keep their newlines. Never throws.
 */
export async function extractFileContent(buf: Buffer, opts: ExtractOptions = {}): Promise<ExtractedContent> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const maxImageBytes = opts.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const { format, mimeType } = detectFileFormat(buf, opts.filename);
  const bytes = buf.length;
  const binary = (reason: string): ExtractedContent => ({ kind: 'binary', format, mimeType, bytes, reason });
  const text = (full: string): ExtractedContent => textResult(format, mimeType, full, bytes, maxChars);

  switch (format) {
    case 'pdf': {
      const t = await pdfToText(buf);
      return t ? text(t) : binary('PDF text extraction failed (scanned or protected PDF?)');
    }
    case 'docx':
      return text(extractDocxText(buf));
    case 'xlsx':
      return text(extractXlsxText(buf));
    case 'pptx':
      return text(extractPptxText(buf));
    case 'zip':
      return text(zipListing(buf));
    case 'html':
      return text(htmlToText(decodeUtf8(buf), { baseUrl: opts.filename ?? null }));
    case 'ipynb': {
      const raw = decodeUtf8(buf);
      return text(notebookToText(raw) ?? raw);
    }
    case 'json': {
      const raw = decodeUtf8(buf);
      try {
        return text(JSON.stringify(JSON.parse(raw), null, 2));
      } catch {
        return text(raw);
      }
    }
    case 'text':
    case 'csv':
      return text(decodeUtf8(buf).replace(/\s+$/, ''));
    case 'image':
      if (bytes > maxImageBytes) {
        return binary(`image too large to inline (${bytes} bytes, limit ${maxImageBytes})`);
      }
      return { kind: 'image', format: 'image', mimeType, base64: buf.toString('base64'), bytes };
    case 'audio':
    case 'video':
      return binary(`${format} file — content cannot be read as text`);
    default:
      return binary('unrecognised binary format');
  }
}

/**
 * Plain-text rendering for callers that can only return a string (e.g. a
 * repository filling a name → text map). Images and binaries become a
 * one-line placeholder; truncation is always stated.
 */
export function extractedToText(x: ExtractedContent): string {
  if (x.kind === 'image') return `[Image — ${x.mimeType}, ${x.bytes} bytes]`;
  if (x.kind === 'binary') return `[${x.format.toUpperCase()} — ${x.mimeType}, ${x.bytes} bytes] ${x.reason}.`;
  if (!x.truncated) return x.text;
  return `${x.text}\n\n[Truncated: showing the first ${x.text.length} of ${x.totalChars} characters.]`;
}
