import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('pdf-extractor', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unmock('pdf-parse');
  });

  it('returns text/plain when pdf-parse yields >= 50 chars', async () => {
    vi.doMock('pdf-parse', () => ({ default: () => Promise.resolve({ text: 'A'.repeat(60) }) }));
    const { extractTextFromBuffer } = await import('@/mcp/resources/pdf-extractor.js');
    const result = await extractTextFromBuffer(Buffer.from('%PDF-fake'), 'brightspace://1/content/topics/2');
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain', text: 'A'.repeat(60) });
    expect(result.contents).toHaveLength(1);
  });

  it('falls back to base64 when text < 50 chars', async () => {
    vi.doMock('pdf-parse', () => ({ default: () => Promise.resolve({ text: 'short' }) }));
    const { extractTextFromBuffer } = await import('@/mcp/resources/pdf-extractor.js');
    const buf = Buffer.from('%PDF-small');
    const result = await extractTextFromBuffer(buf, 'brightspace://1/content/topics/3');
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
    expect(result.contents[1]).toMatchObject({ mimeType: 'application/pdf', blob: buf.toString('base64') });
  });

  it('falls back to base64 when pdf-parse throws', async () => {
    vi.doMock('pdf-parse', () => ({ default: () => Promise.reject(new Error('not a pdf')) }));
    const { extractTextFromBuffer } = await import('@/mcp/resources/pdf-extractor.js');
    const buf = Buffer.from('not-a-pdf');
    const result = await extractTextFromBuffer(buf, 'brightspace://1/content/topics/4');
    expect(result.contents).toHaveLength(2);
    expect(result.contents[1]).toMatchObject({ mimeType: 'application/pdf' });
  });
});
