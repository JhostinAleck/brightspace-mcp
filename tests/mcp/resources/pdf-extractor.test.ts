import { describe, expect, it, beforeAll } from 'vitest';

import { extractTextFromBuffer } from '@/mcp/resources/pdf-extractor.js';
import { TINY_PNG, buildDocx, buildPdf, warmPdfParser } from '@tests/helpers/zip.js';

beforeAll(warmPdfParser, 60_000);

const URI = 'brightspace://1/content/topics/2';

describe('pdf-extractor', () => {
  it('returns text/plain for a real PDF with enough text (pdf-parse v2)', async () => {
    const buf = buildPdf(['Programa del curso ISIS 1234', 'Evaluacion: parciales, talleres y proyecto final']);
    const result = await extractTextFromBuffer(buf, URI);
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({ uri: URI, mimeType: 'text/plain' });
    const first = result.contents[0];
    expect(first && 'text' in first ? first.text : '').toContain('Programa del curso ISIS 1234');
  });

  it('falls back to base64 when the PDF yields < 50 chars (scanned PDFs)', async () => {
    const buf = buildPdf(['short']);
    const result = await extractTextFromBuffer(buf, 'brightspace://1/content/topics/3');
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
    expect(result.contents[1]).toMatchObject({ mimeType: 'application/pdf', blob: buf.toString('base64') });
  });

  it('falls back to base64 when the PDF cannot be parsed', async () => {
    const buf = Buffer.from('%PDF-1.4 garbage');
    const result = await extractTextFromBuffer(buf, 'brightspace://1/content/topics/4');
    expect(result.contents).toHaveLength(2);
    expect(result.contents[1]).toMatchObject({ mimeType: 'application/pdf', blob: buf.toString('base64') });
  });

  it('extracts text from non-PDF documents (DOCX)', async () => {
    const result = await extractTextFromBuffer(buildDocx(['Instrucciones del taller']), `${URI}/Taller.docx`);
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain', text: expect.stringContaining('Instrucciones del taller') });
  });

  it('returns images as a blob with their own mime type', async () => {
    const result = await extractTextFromBuffer(TINY_PNG, `${URI}/diagram.png`);
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({ mimeType: 'image/png', blob: TINY_PNG.toString('base64') });
  });
});
