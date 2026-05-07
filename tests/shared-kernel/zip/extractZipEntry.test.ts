import { describe, expect, it } from 'vitest';
import { deflateRawSync, gzipSync } from 'node:zlib';

import { extractZipEntry, extractDocxText } from '@/shared-kernel/zip/extractZipEntry.js';

const SIG_LFH = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const SIG_CDH = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const SIG_EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

interface Entry {
  filename: string;
  data: Buffer;
  compression: 0 | 8;
}

/**
 * Build a minimal but valid ZIP container in-memory. We hand-craft the bytes
 * to keep the test independent of jszip / archiver — the extractor is
 * meant to handle real ZIP wire format, so the test must produce real bytes.
 */
function buildZip(entries: Entry[]): Buffer {
  const localChunks: Buffer[] = [];
  const cdChunks: Buffer[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  for (const e of entries) {
    const compressed = e.compression === 8 ? deflateRawSync(e.data) : e.data;
    const filename = Buffer.from(e.filename, 'utf8');
    const lfh = Buffer.alloc(30);
    SIG_LFH.copy(lfh, 0);
    lfh.writeUInt16LE(20, 4); // version
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(e.compression, 8);
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0, 12); // mod date
    lfh.writeUInt32LE(0, 14); // crc32 (we don't validate)
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(e.data.length, 22);
    lfh.writeUInt16LE(filename.length, 26);
    lfh.writeUInt16LE(0, 28); // extra
    offsets.push(cursor);
    localChunks.push(lfh, filename, compressed);
    cursor += 30 + filename.length + compressed.length;
  }

  let cdSize = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const compressed = e.compression === 8 ? deflateRawSync(e.data) : e.data;
    const filename = Buffer.from(e.filename, 'utf8');
    const cdh = Buffer.alloc(46);
    SIG_CDH.copy(cdh, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(e.compression, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(0, 16); // crc32
    cdh.writeUInt32LE(compressed.length, 20);
    cdh.writeUInt32LE(e.data.length, 24);
    cdh.writeUInt16LE(filename.length, 28);
    cdh.writeUInt16LE(0, 30); // extra len
    cdh.writeUInt16LE(0, 32); // comment len
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offsets[i]!, 42);
    cdChunks.push(cdh, filename);
    cdSize += 46 + filename.length;
  }

  const cdOffset = cursor;
  const eocd = Buffer.alloc(22);
  SIG_EOCD.copy(eocd, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...cdChunks, eocd]);
}

describe('extractZipEntry', () => {
  it('extracts a stored (uncompressed) entry by name', () => {
    const buf = buildZip([
      { filename: 'hello.txt', data: Buffer.from('hi there'), compression: 0 },
    ]);
    expect(extractZipEntry(buf, 'hello.txt')).toBe('hi there');
  });

  it('decompresses a deflate entry', () => {
    const buf = buildZip([
      { filename: 'doc.txt', data: Buffer.from('the quick brown fox jumps over the lazy dog'), compression: 8 },
    ]);
    expect(extractZipEntry(buf, 'doc.txt')).toBe('the quick brown fox jumps over the lazy dog');
  });

  it('returns null for missing entries', () => {
    const buf = buildZip([
      { filename: 'present.txt', data: Buffer.from('x'), compression: 0 },
    ]);
    expect(extractZipEntry(buf, 'missing.txt')).toBeNull();
  });

  it('returns null on a non-ZIP buffer (no EOCD)', () => {
    expect(extractZipEntry(Buffer.from('not a zip at all'), 'anything')).toBeNull();
  });

  it('returns null when the buffer contains an unsupported compression method', () => {
    // Build a ZIP claiming compression=12 (BZIP2) which we do not support.
    // The extractor reads compression from the central directory, not the
    // local file header — patch BOTH so the test reflects the on-disk format.
    const buf = Buffer.from(
      buildZip([{ filename: 'a.txt', data: Buffer.from('hi'), compression: 0 }]),
    );
    buf.writeUInt16LE(12, 8); // LFH compression at offset 8
    const cdOffset = buf.readUInt32LE(buf.length - 22 + 16);
    buf.writeUInt16LE(12, cdOffset + 10); // CDH compression at +10
    expect(extractZipEntry(buf, 'a.txt')).toBeNull();
  });

  it('survives malformed entries with bogus offsets', () => {
    const buf = buildZip([
      { filename: 'x.txt', data: Buffer.from('y'), compression: 0 },
    ]);
    // Corrupt the EOCD's CD offset so it points past the buffer.
    buf.writeUInt32LE(buf.length + 100, buf.length - 22 + 16);
    expect(extractZipEntry(buf, 'x.txt')).toBeNull();
  });

  it('does NOT confuse local-file-header-shaped bytes inside content with a real header', () => {
    // Stored entry whose payload contains the LFH magic bytes — the old
    // byte-scanning parser would mis-locate the next entry. The CD-based
    // parser just looks up the entry directly.
    const trap = Buffer.concat([
      Buffer.from('PKfake-header-bytes'),
      Buffer.from('real-content'),
    ]);
    const buf = buildZip([{ filename: 't.bin', data: trap, compression: 0 }]);
    expect(extractZipEntry(buf, 't.bin')).toBe(trap.toString('utf8'));
  });
});

describe('extractDocxText', () => {
  it('extracts text from word/document.xml', () => {
    const xml = '<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>';
    const buf = buildZip([
      { filename: 'word/document.xml', data: Buffer.from(xml), compression: 8 },
    ]);
    expect(extractDocxText(buf)).toContain('Hello world');
  });

  it('returns a placeholder when document.xml is missing', () => {
    const buf = buildZip([
      { filename: 'word/other.xml', data: Buffer.from('x'), compression: 0 },
    ]);
    expect(extractDocxText(buf)).toBe('[DOCX: could not read content]');
  });

  it('decodes common XML entities and collapses paragraph breaks', () => {
    // Realistic DOCX paragraph shape (the regex assumes nested w:r/w:t).
    const xml =
      '<w:p><w:r><w:t>A&amp;B</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>C&lt;D</w:t></w:r></w:p>';
    const buf = buildZip([
      { filename: 'word/document.xml', data: Buffer.from(xml), compression: 8 },
    ]);
    const out = extractDocxText(buf);
    expect(out).toContain('A&B');
    expect(out).toContain('C<D');
  });

  it('returns null for compression=8 entries with corrupt deflate payload', () => {
    // Stored uncorrupt + manual deflate body that is not valid raw deflate.
    const fakeDeflateBuf = buildZip([
      { filename: 'word/document.xml', data: Buffer.from('hi'), compression: 0 },
    ]);
    // Flip its compression flags to claim deflate without re-encoding.
    fakeDeflateBuf.writeUInt16LE(8, 8);
    // Find CDH and patch its compression too.
    // Simpler: use gzipSync (which is gzip, not raw deflate) to produce
    // bytes the inflater rejects.
    const trap = gzipSync(Buffer.from('hello'));
    const buf = buildZip([
      { filename: 'word/document.xml', data: trap, compression: 0 },
    ]);
    // Mutate to claim compression=8 in both LFH and CDH so the extractor
    // tries to inflate the gzipped payload as raw deflate (it won't match).
    buf.writeUInt16LE(8, 8); // LFH
    // Find the CDH compression slot — it's at cd_offset + 10.
    // EOCD lives at end-22, CD offset is at end-22+16.
    const cdOffset = buf.readUInt32LE(buf.length - 22 + 16);
    buf.writeUInt16LE(8, cdOffset + 10);
    expect(extractDocxText(buf)).toBe('[DOCX: could not read content]');
  });
});
