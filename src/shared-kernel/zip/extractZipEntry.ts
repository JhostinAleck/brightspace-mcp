import { inflateRawSync } from 'node:zlib';

const SIG_LFH = 0x04034b50;
const SIG_EOCD = 0x06054b50;
const EOCD_MIN = 22;
const LFH_MIN = 30;

interface CdEntry {
  filename: string;
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function findEocd(buf: Buffer): number {
  const max = Math.min(buf.length - EOCD_MIN, 65557);
  for (let i = buf.length - EOCD_MIN; i >= buf.length - max; i--) {
    if (i < 0) break;
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function readCentralDirectory(buf: Buffer): CdEntry[] | null {
  const eocd = findEocd(buf);
  if (eocd < 0) return null;
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize > buf.length) return null;

  const entries: CdEntry[] = [];
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (p < cdEnd - 46) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const compression = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const filenameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const filename = buf.slice(p + 46, p + 46 + filenameLen).toString('utf8');
    entries.push({ filename, compression, compressedSize, localHeaderOffset });
    p += 46 + filenameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Extract a single file from a ZIP buffer using the central directory.
 * Returns null if the entry is missing, the buffer is malformed, or the
 * compression method is unsupported (only stored=0 and deflate=8 are handled).
 *
 * Why central directory: scanning for local file header signatures byte-by-byte
 * is unsafe — file content can contain the same magic bytes. The central
 * directory is the canonical index.
 */
export function extractZipEntry(buf: Buffer, target: string): string | null {
  const cd = readCentralDirectory(buf);
  if (!cd) return null;
  const entry = cd.find((e) => e.filename === target);
  if (!entry) return null;
  const lfhOffset = entry.localHeaderOffset;
  if (lfhOffset + LFH_MIN > buf.length) return null;
  if (buf.readUInt32LE(lfhOffset) !== SIG_LFH) return null;
  const filenameLen = buf.readUInt16LE(lfhOffset + 26);
  const extraLen = buf.readUInt16LE(lfhOffset + 28);
  const dataStart = lfhOffset + LFH_MIN + filenameLen + extraLen;
  if (dataStart + entry.compressedSize > buf.length) return null;
  const data = buf.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.compression === 0) return data.toString('utf8');
  if (entry.compression === 8) {
    try {
      return inflateRawSync(data).toString('utf8');
    } catch {
      return null;
    }
  }
  return null;
}

// Note: paragraph regex uses lazy `*?` because real DOCX paragraphs may or
// may not have nested children. A greedy match would swallow the entire
// paragraph (including its text) on shapes like `<w:p>plain</w:p>`.
const DOCX_REPLACES: Array<[RegExp, string]> = [
  [/<w:br[^>]*\/?>/g, '\n'],
  [/<w:p(?:>|\s[^>]*?>)/g, '\n'],
  [/<[^>]+>/g, ''],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&apos;/g, "'"],
  [/&quot;/g, '"'],
  [/&#xA;/g, '\n'],
  [/\n{3,}/g, '\n\n'],
];

export function extractDocxText(buf: Buffer): string {
  const xml = extractZipEntry(buf, 'word/document.xml');
  if (!xml) return '[DOCX: could not read content]';
  let out = xml;
  for (const [re, rep] of DOCX_REPLACES) out = out.replace(re, rep);
  return out.trim();
}
