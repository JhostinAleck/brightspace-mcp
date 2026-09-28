import { describe, expect, it, beforeAll } from 'vitest';

import { detectFileFormat } from '@/shared-kernel/extract/detectFileFormat.js';
import { extractFileContent } from '@/shared-kernel/extract/extractFileContent.js';
import { TINY_PNG, buildDocx, buildPdf, buildPptx, buildXlsx, buildZip, warmPdfParser } from '@tests/helpers/zip.js';

beforeAll(warmPdfParser, 60_000);

describe('detectFileFormat', () => {
  it('detects Office files from the zip central directory, not the first 200 bytes', () => {
    // Real Office files start with [Content_Types].xml — the old header sniff missed them.
    expect(detectFileFormat(buildDocx(['hola'])).format).toBe('docx');
    expect(detectFileFormat(buildPptx([['hola']])).format).toBe('pptx');
    expect(detectFileFormat(buildXlsx([['a']])).format).toBe('xlsx');
    expect(detectFileFormat(buildZip([{ filename: 'src/Main.java', data: 'class A{}' }])).format).toBe('zip');
  });

  it('detects images by magic bytes', () => {
    expect(detectFileFormat(TINY_PNG)).toEqual({ format: 'image', mimeType: 'image/png' });
    expect(detectFileFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])).mimeType).toBe('image/jpeg');
    expect(detectFileFormat(Buffer.from('GIF89a......')).mimeType).toBe('image/gif');
    expect(detectFileFormat(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')).mimeType).toBe('image/webp');
  });

  it('detects audio/video by magic bytes', () => {
    expect(detectFileFormat(Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000')).format).toBe('audio');
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(8)]);
    expect(detectFileFormat(mp4).format).toBe('video');
  });

  it('uses the filename extension for formats D2L serves as d2l/unknowntype', () => {
    expect(detectFileFormat(Buffer.from('{"cells":[]}'), 'Laboratorio_1.ipynb').format).toBe('ipynb');
    expect(detectFileFormat(Buffer.from('a,b\n1,2\n'), '/content/enforced/1-X/data.csv').format).toBe('csv');
    expect(detectFileFormat(buildXlsx([['a']]), 'Retro.xlsm').format).toBe('xlsx');
  });

  it('treats UTF-8 prose (accents, ñ) as text', () => {
    expect(detectFileFormat(Buffer.from('Introducción a las redes: capa de aplicación, señales y más.')).format).toBe('text');
  });

  it('falls back to binary for unknown bytes', () => {
    expect(detectFileFormat(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])).format).toBe('binary');
  });
});

describe('extractFileContent', () => {
  it('extracts PDF text keeping line breaks', async () => {
    const r = await extractFileContent(buildPdf(['Capitulo 1 Redes', 'Capa de aplicacion']));
    expect(r.kind).toBe('text');
    if (r.kind !== 'text') return;
    expect(r.format).toBe('pdf');
    expect(r.text).toContain('Capitulo 1 Redes');
    expect(r.text).toMatch(/Capitulo 1 Redes\s*\n\s*Capa de aplicacion/);
    expect(r.truncated).toBe(false);
  });

  it('reports a PDF that cannot be parsed as binary with a reason', async () => {
    const r = await extractFileContent(Buffer.from('%PDF-1.4 garbage'));
    expect(r.kind).toBe('binary');
    if (r.kind === 'binary') expect(r.reason).toMatch(/PDF/);
  });

  it('extracts DOCX, PPTX and XLSX text', async () => {
    const docx = await extractFileContent(buildDocx(['Instrucciones del taller']));
    expect(docx.kind === 'text' && docx.text).toContain('Instrucciones del taller');
    const pptx = await extractFileContent(buildPptx([['Ciclo de vida'], ['Pruebas']]));
    expect(pptx.kind === 'text' && pptx.text).toContain('Ciclo de vida');
    expect(pptx.kind === 'text' && pptx.format).toBe('pptx');
    const xlsm = await extractFileContent(buildXlsx([['Criterio', 'Nota'], ['Diseño', '4.5']]), { filename: 'Retro.xlsm' });
    expect(xlsm.kind === 'text' && xlsm.text).toContain('Diseño\t4.5');
  });

  it('keeps newlines in plain text and CSV', async () => {
    const csv = await extractFileContent(Buffer.from('\ufeffciudad,lat\r\nBogota,4.7\r\nCali,3.4\r\n'), { filename: 'localizaciones.csv' });
    expect(csv.kind === 'text' && csv.text).toBe('ciudad,lat\nBogota,4.7\nCali,3.4');
    const txt = await extractFileContent(Buffer.from('line one\n\n  indented line two\n'), { filename: 'arrays.txt' });
    expect(txt.kind === 'text' && txt.text).toBe('line one\n\n  indented line two');
  });

  it('renders Jupyter notebooks as markdown + fenced code cells', async () => {
    const nb = {
      metadata: { kernelspec: { language: 'python' } },
      cells: [
        { cell_type: 'markdown', source: ['# Laboratorio 1\n', 'Una introducción a NumPy'] },
        { cell_type: 'code', source: 'import numpy as np\nnp.zeros(3)', outputs: [{ output_type: 'stream', text: ['big output'] }] },
      ],
    };
    const r = await extractFileContent(Buffer.from(JSON.stringify(nb)), { filename: 'Laboratorio_1.ipynb' });
    expect(r.kind).toBe('text');
    if (r.kind !== 'text') return;
    expect(r.format).toBe('ipynb');
    expect(r.text).toContain('# Laboratorio 1\nUna introducción a NumPy');
    expect(r.text).toContain('```python\nimport numpy as np\nnp.zeros(3)\n```');
    expect(r.text).not.toContain('"cell_type"');
  });

  it('pretty-prints JSON', async () => {
    const r = await extractFileContent(Buffer.from('{"a":1}'), { filename: 'x.json' });
    expect(r.kind === 'text' && r.text).toBe('{\n  "a": 1\n}');
  });

  it('converts HTML with links resolved against the page URL', async () => {
    const html = '<!DOCTYPE html><html><body><p>Intro</p><a href="files/Lab1.pdf">Lab 1</a></body></html>';
    const r = await extractFileContent(Buffer.from(html), { filename: '/content/enforced/1-X/dir/Page.html' });
    expect(r.kind === 'text' && r.format).toBe('html');
    expect(r.kind === 'text' && r.text).toContain('Lab 1 (/content/enforced/1-X/dir/files/Lab1.pdf)');
  });

  it('truncates long output and says so', async () => {
    const r = await extractFileContent(Buffer.from('a'.repeat(50_000)), { filename: 'big.txt', maxChars: 1000 });
    expect(r.kind).toBe('text');
    if (r.kind !== 'text') return;
    expect(r.text).toHaveLength(1000);
    expect(r.truncated).toBe(true);
    expect(r.totalChars).toBe(50_000);
  });

  it('uses a generous default limit (well above the old 5k/12k caps)', async () => {
    const r = await extractFileContent(Buffer.from('b'.repeat(30_000)), { filename: 'big.txt' });
    expect(r.kind === 'text' && r.truncated).toBe(false);
  });

  it('returns images as base64', async () => {
    const r = await extractFileContent(TINY_PNG, { filename: 'Rubric.png' });
    expect(r).toMatchObject({ kind: 'image', mimeType: 'image/png', base64: TINY_PNG.toString('base64') });
  });

  it('refuses to inline images above the size cap', async () => {
    const r = await extractFileContent(TINY_PNG, { maxImageBytes: 10 });
    expect(r.kind).toBe('binary');
    if (r.kind === 'binary') expect(r.reason).toMatch(/too large/i);
  });

  it('returns metadata only for audio/video', async () => {
    const r = await extractFileContent(Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000'), { filename: 'numeros.mp3' });
    expect(r).toMatchObject({ kind: 'binary', format: 'audio' });
  });

  it('describes a plain zip by listing its entries', async () => {
    const r = await extractFileContent(buildZip([{ filename: 'src/Main.java', data: 'x' }, { filename: 'README.md', data: 'y' }]));
    expect(r.kind).toBe('text');
    expect(r.kind === 'text' && r.text).toContain('src/Main.java');
  });
});
