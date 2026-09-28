import { deflateRawSync } from 'node:zlib';

const SIG_LFH = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const SIG_CDH = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const SIG_EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

export interface ZipEntryInput {
  filename: string;
  data: Buffer | string;
  compression?: 0 | 8;
}

/**
 * Build a minimal but valid ZIP container in-memory (real wire format, no
 * third-party writer) so extractors are exercised against genuine bytes.
 * Entries are written in the given order — handy to reproduce Office files,
 * whose first entry is always `[Content_Types].xml`.
 */
export function buildZip(input: ZipEntryInput[]): Buffer {
  const localChunks: Buffer[] = [];
  const cdChunks: Buffer[] = [];
  let cursor = 0;
  let cdSize = 0;

  const prepared = input.map((e) => {
    const data = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : e.data;
    const compression = e.compression ?? 8;
    const compressed = compression === 8 ? deflateRawSync(data) : data;
    return { filename: Buffer.from(e.filename, 'utf8'), data, compression, compressed };
  });

  const offsets: number[] = [];
  for (const e of prepared) {
    const lfh = Buffer.alloc(30);
    SIG_LFH.copy(lfh, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(e.compression, 8);
    lfh.writeUInt32LE(e.compressed.length, 18);
    lfh.writeUInt32LE(e.data.length, 22);
    lfh.writeUInt16LE(e.filename.length, 26);
    offsets.push(cursor);
    localChunks.push(lfh, e.filename, e.compressed);
    cursor += 30 + e.filename.length + e.compressed.length;
  }

  prepared.forEach((e, i) => {
    const cdh = Buffer.alloc(46);
    SIG_CDH.copy(cdh, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(e.compression, 10);
    cdh.writeUInt32LE(e.compressed.length, 20);
    cdh.writeUInt32LE(e.data.length, 24);
    cdh.writeUInt16LE(e.filename.length, 28);
    cdh.writeUInt32LE(offsets[i]!, 42);
    cdChunks.push(cdh, e.filename);
    cdSize += 46 + e.filename.length;
  });

  const eocd = Buffer.alloc(22);
  SIG_EOCD.copy(eocd, 0);
  eocd.writeUInt16LE(prepared.length, 8);
  eocd.writeUInt16LE(prepared.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cursor, 16);
  return Buffer.concat([...localChunks, ...cdChunks, eocd]);
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';

/** A DOCX whose first entry is `[Content_Types].xml`, like real Word output. */
export function buildDocx(paragraphs: string[]): Buffer {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  return buildZip([
    { filename: '[Content_Types].xml', data: CONTENT_TYPES },
    { filename: '_rels/.rels', data: '<Relationships/>' },
    { filename: 'word/document.xml', data: `<w:document><w:body>${body}</w:body></w:document>` },
  ]);
}

/** A PPTX with one slide per entry; each slide is a list of text runs. */
export function buildPptx(slides: string[][], opts: { reverseEntryOrder?: boolean } = {}): Buffer {
  const slideEntries = slides.map((runs, i) => ({
    filename: `ppt/slides/slide${i + 1}.xml`,
    data: `<p:sld><p:cSld><p:spTree>${runs
      .map((r) => `<p:sp><p:txBody><a:p><a:r><a:t>${r}</a:t></a:r></a:p></p:txBody></p:sp>`)
      .join('')}</p:spTree></p:cSld></p:sld>`,
  }));
  if (opts.reverseEntryOrder) slideEntries.reverse();
  return buildZip([
    { filename: '[Content_Types].xml', data: CONTENT_TYPES },
    { filename: 'ppt/presentation.xml', data: '<p:presentation/>' },
    ...slideEntries,
  ]);
}

/** An XLSX/XLSM with a single sheet of inline strings. */
export function buildXlsx(rows: string[][], sheetName = 'Hoja1'): Buffer {
  const cols = 'ABCDEFGHIJ';
  const sheetRows = rows
    .map((r, ri) => `<row r="${ri + 1}">${r
      .map((v, ci) => `<c r="${cols[ci]}${ri + 1}" t="inlineStr"><is><t>${v}</t></is></c>`)
      .join('')}</row>`)
    .join('');
  return buildZip([
    { filename: '[Content_Types].xml', data: CONTENT_TYPES },
    { filename: 'xl/workbook.xml', data: `<workbook><sheets><sheet name="${sheetName}" sheetId="1"/></sheets></workbook>` },
    { filename: 'xl/worksheets/sheet1.xml', data: `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>` },
  ]);
}

/**
 * Hand-built single-page PDF with correct xref offsets whose page draws each
 * given line of text. Enough for pdf-parse to extract real text.
 */
export function buildPdf(lines: string[]): Buffer {
  const stream = ['BT', '/F1 12 Tf', '72 720 Td', '14 TL',
    ...lines.map((l) => `(${l.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** 1x1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * pdf-parse is imported lazily by the extractor; loading pdfjs can take
 * several seconds on slow CI runners, so warm it outside the per-test timeout.
 */
export async function warmPdfParser(): Promise<void> {
  await import('pdf-parse');
}
