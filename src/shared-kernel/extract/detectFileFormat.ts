import { listZipEntries } from '@/shared-kernel/zip/extractZipEntry.js';

export type FileFormat =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'zip'
  | 'html'
  | 'text'
  | 'csv'
  | 'json'
  | 'ipynb'
  | 'image'
  | 'audio'
  | 'video'
  | 'binary';

export interface DetectedFormat {
  format: FileFormat;
  mimeType: string;
}

const MIME: Record<Exclude<FileFormat, 'image' | 'audio' | 'video'>, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  html: 'text/html',
  text: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  ipynb: 'application/x-ipynb+json',
  binary: 'application/octet-stream',
};

const EXT_FORMAT: Record<string, DetectedFormat> = {
  ipynb: { format: 'ipynb', mimeType: MIME.ipynb },
  json: { format: 'json', mimeType: MIME.json },
  csv: { format: 'csv', mimeType: MIME.csv },
  tsv: { format: 'csv', mimeType: 'text/tab-separated-values' },
  html: { format: 'html', mimeType: MIME.html },
  htm: { format: 'html', mimeType: MIME.html },
  png: { format: 'image', mimeType: 'image/png' },
  jpg: { format: 'image', mimeType: 'image/jpeg' },
  jpeg: { format: 'image', mimeType: 'image/jpeg' },
  gif: { format: 'image', mimeType: 'image/gif' },
  webp: { format: 'image', mimeType: 'image/webp' },
  mp3: { format: 'audio', mimeType: 'audio/mpeg' },
  wav: { format: 'audio', mimeType: 'audio/wav' },
  m4a: { format: 'audio', mimeType: 'audio/mp4' },
  ogg: { format: 'audio', mimeType: 'audio/ogg' },
  mp4: { format: 'video', mimeType: 'video/mp4' },
  mov: { format: 'video', mimeType: 'video/quicktime' },
  webm: { format: 'video', mimeType: 'video/webm' },
  avi: { format: 'video', mimeType: 'video/x-msvideo' },
  mkv: { format: 'video', mimeType: 'video/x-matroska' },
};

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'py', 'java', 'js', 'ts', 'c', 'h', 'cpp', 'cs', 'kt', 'swift', 'dart',
  'r', 'm', 'sql', 'xml', 'yaml', 'yml', 'tex', 'log', 'sh', 'rb', 'go', 'rs', 'css', 'srt', 'vtt',
]);

/** Lower-case extension of a filename, path or URL (query/hash ignored). */
export function fileExtension(nameOrUrl: string | null | undefined): string | null {
  if (!nameOrUrl) return null;
  const path = nameOrUrl.split(/[?#]/)[0] ?? '';
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(buf: Buffer, start: number, end: number): string {
  return buf.subarray(start, end).toString('latin1');
}

function sniffMagic(buf: Buffer): DetectedFormat | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return { format: 'pdf', mimeType: MIME.pdf };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return { format: 'image', mimeType: 'image/png' };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { format: 'image', mimeType: 'image/jpeg' };
  if (ascii(buf, 0, 4) === 'GIF8') return { format: 'image', mimeType: 'image/gif' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { format: 'image', mimeType: 'image/webp' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WAVE') return { format: 'audio', mimeType: 'audio/wav' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'AVI ') return { format: 'video', mimeType: 'video/x-msvideo' };
  if (ascii(buf, 0, 3) === 'ID3') return { format: 'audio', mimeType: 'audio/mpeg' };
  if (ascii(buf, 0, 4) === 'OggS') return { format: 'audio', mimeType: 'audio/ogg' };
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { format: 'video', mimeType: 'video/webm' };
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (brand.startsWith('M4A')) return { format: 'audio', mimeType: 'audio/mp4' };
    if (brand === 'qt  ') return { format: 'video', mimeType: 'video/quicktime' };
    return { format: 'video', mimeType: 'video/mp4' };
  }
  // MPEG audio frame sync (mp3 without ID3 tag).
  if (buf.length >= 2 && buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0) return { format: 'audio', mimeType: 'audio/mpeg' };
  return null;
}

function sniffZip(buf: Buffer): DetectedFormat | null {
  if (!startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return null;
  const entries = listZipEntries(buf) ?? [];
  if (entries.some((e) => e.startsWith('word/'))) return { format: 'docx', mimeType: MIME.docx };
  if (entries.some((e) => e.startsWith('xl/'))) return { format: 'xlsx', mimeType: MIME.xlsx };
  if (entries.some((e) => e.startsWith('ppt/'))) return { format: 'pptx', mimeType: MIME.pptx };
  return { format: 'zip', mimeType: MIME.zip };
}

function looksLikeText(buf: Buffer): boolean {
  if (buf.length === 0) return true;
  const sample = buf.subarray(0, 4096).toString('utf8');
  let bad = 0;
  for (const ch of sample) {
    const c = ch.charCodeAt(0);
    if (ch === '�' || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) bad++;
  }
  // A multi-byte char cut at the 4096 boundary yields one U+FFFD; tolerate a little noise.
  return bad / Math.max(sample.length, 1) < 0.02;
}

function sniffMarkup(buf: Buffer): boolean {
  const head = buf.subarray(0, 1024).toString('utf8').toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html') || head.includes('<body') ||
    /<(p|div|table|h[1-6])[\s>]/.test(head);
}

/**
 * Identify a downloaded file. Order matters: binary magic bytes first (they
 * never lie), then the zip central directory for Office formats, then the
 * filename extension (D2L serves .ipynb/.xlsm/... as `d2l/unknowntype`, so the
 * topic URL is often the only hint for text formats), then a content sniff.
 */
export function detectFileFormat(buf: Buffer, filename?: string | null): DetectedFormat {
  const magic = sniffMagic(buf);
  if (magic) return magic;
  const zip = sniffZip(buf);
  if (zip) return zip;

  const ext = fileExtension(filename);
  const byExt = ext ? EXT_FORMAT[ext] : undefined;
  if (byExt && !['image', 'audio', 'video'].includes(byExt.format)) return byExt;
  if (ext && TEXT_EXTS.has(ext) && looksLikeText(buf)) return { format: 'text', mimeType: MIME.text };

  if (looksLikeText(buf)) {
    if (sniffMarkup(buf)) return { format: 'html', mimeType: MIME.html };
    return { format: 'text', mimeType: MIME.text };
  }
  // Media whose magic bytes we did not recognise — trust the extension.
  if (byExt) return byExt;
  return { format: 'binary', mimeType: MIME.binary };
}
