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

// ── XLSX extraction ─────────────────────────────────────────────────────────

function xlsxDecodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function xlsxParseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  // Each <si> element is one shared string (may contain <t> or <r><t>)
  const siRe = /<si[^>]*>([\s\S]*?)<\/si>/g;
  const tRe = /<t[^>]*>([^<]*)<\/t>/g;
  let si: RegExpExecArray | null;
  while ((si = siRe.exec(xml)) !== null) {
    const body = si[1] ?? '';
    let text = '';
    let t: RegExpExecArray | null;
    tRe.lastIndex = 0;
    while ((t = tRe.exec(body)) !== null) text += t[1] ?? '';
    strings.push(xlsxDecodeEntities(text));
  }
  return strings;
}

function xlsxColToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function xlsxParseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(xml)) !== null) {
    const rowIdx = parseInt((/<row[^>]*r="(\d+)"/.exec(`<row ${row[0]}`) ?? ['', '0'])[1], 10) - 1;
    if (rowIdx < 0) continue;
    while (rows.length <= rowIdx) rows.push([]);
    const rowData = rows[rowIdx]!;
    let cell: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cell = cellRe.exec(row[1] ?? '')) !== null) {
      const colIdx = xlsxColToIndex(cell[1] ?? '');
      const attrs = cell[3] ?? '';
      const body = cell[4] ?? '';
      const tMatch = /t="([^"]+)"/.exec(attrs);
      const cellType = tMatch ? tMatch[1] : 'n';
      const vMatch = /<v>([^<]*)<\/v>/.exec(body);
      const rawVal = vMatch ? vMatch[1] : '';
      let value = '';
      if (cellType === 's') {
        value = shared[parseInt(rawVal ?? '0', 10)] ?? '';
      } else if (cellType === 'inlineStr') {
        const tInline = /<t[^>]*>([^<]*)<\/t>/.exec(body);
        value = xlsxDecodeEntities(tInline ? (tInline[1] ?? '') : '');
      } else if (cellType === 'b') {
        value = rawVal === '1' ? 'TRUE' : 'FALSE';
      } else {
        value = xlsxDecodeEntities(rawVal ?? '');
      }
      while (rowData.length <= colIdx) rowData.push('');
      rowData[colIdx] = value;
    }
  }
  return rows;
}

function xlsxSheetNames(workbookXml: string): string[] {
  const names: string[] = [];
  const re = /<sheet[^>]+name="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(workbookXml)) !== null) names.push(m[1] ?? '');
  return names;
}

export function extractXlsxText(buf: Buffer): string {
  const sharedXml = extractZipEntry(buf, 'xl/sharedStrings.xml');
  const shared = sharedXml ? xlsxParseSharedStrings(sharedXml) : [];

  const workbookXml = extractZipEntry(buf, 'xl/workbook.xml');
  const sheetNames = workbookXml ? xlsxSheetNames(workbookXml) : [];

  const parts: string[] = [];
  let sheetIndex = 1;
  while (true) {
    const sheetXml = extractZipEntry(buf, `xl/worksheets/sheet${sheetIndex}.xml`);
    if (!sheetXml) break;
    const name = sheetNames[sheetIndex - 1] ?? `Sheet${sheetIndex}`;
    const grid = xlsxParseSheet(sheetXml, shared);
    const text = grid
      .filter((r) => r.some((c) => c !== ''))
      .map((r) => r.join('\t'))
      .join('\n');
    if (text) parts.push(`=== ${name} ===\n${text}`);
    sheetIndex++;
    if (sheetIndex > 20) break; // safety cap
  }

  if (parts.length === 0) return '[Excel: no readable content found]';
  return parts.join('\n\n').slice(0, 12_000);
}

// ── DOCX extraction ──────────────────────────────────────────────────────────

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
