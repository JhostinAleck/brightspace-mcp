import { describe, expect, it } from 'vitest';

import { extractPptxText, extractXlsxText, listZipEntries } from '@/shared-kernel/zip/extractZipEntry.js';
import { buildPptx, buildXlsx, buildZip } from '@tests/helpers/zip.js';

describe('listZipEntries', () => {
  it('lists every entry name from the central directory, in order', () => {
    const buf = buildZip([
      { filename: '[Content_Types].xml', data: '<Types/>' },
      { filename: 'word/document.xml', data: '<w:document/>' },
    ]);
    expect(listZipEntries(buf)).toEqual(['[Content_Types].xml', 'word/document.xml']);
  });

  it('returns null for a buffer that is not a zip', () => {
    expect(listZipEntries(Buffer.from('not a zip at all, just text'))).toBeNull();
  });
});

describe('extractPptxText', () => {
  it('returns slide text runs in numeric slide order, not zip entry order', () => {
    const slides = Array.from({ length: 11 }, (_, i) => [`Slide title ${i + 1}`, `Body ${i + 1}`]);
    const out = extractPptxText(buildPptx(slides, { reverseEntryOrder: true }));
    const idx1 = out.indexOf('Slide title 1\n');
    const idx2 = out.indexOf('Slide title 2\n');
    const idx10 = out.indexOf('Slide title 10');
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx10);
    expect(out).toContain('--- Slide 1 ---');
    expect(out).toContain('--- Slide 11 ---');
  });

  it('decodes XML entities in text runs', () => {
    const out = extractPptxText(buildPptx([['Redes &amp; Servicios &lt;TCP&gt;']]));
    expect(out).toContain('Redes & Servicios <TCP>');
  });

  it('reports when there are no slides', () => {
    const buf = buildZip([{ filename: '[Content_Types].xml', data: '<Types/>' }]);
    expect(extractPptxText(buf)).toBe('[PowerPoint: no readable slide text found]');
  });
});

describe('extractXlsxText', () => {
  it('does not silently cap output (callers truncate with a notice)', () => {
    const rows = Array.from({ length: 1500 }, (_, i) => [`row${i}`, 'x'.repeat(10)]);
    const out = extractXlsxText(buildXlsx(rows));
    expect(out.length).toBeGreaterThan(12_000);
    expect(out).toContain('row1499');
  });
});
