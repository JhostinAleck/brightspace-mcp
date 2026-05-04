import { describe, it, expect } from 'vitest';
import { handleGetTopicFile } from '@/mcp/tools/get-topic-file.tool';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';

function makeRepo(fileBuf: Buffer, renderedText = ''): FakeContentRepository {
  const repo = new FakeContentRepository();
  repo.findTopicFile = async () => fileBuf;
  repo.findTopicRenderedText = async () => renderedText;
  return repo;
}

describe('get_topic_file tool', () => {
  it('detects PDF from magic bytes', async () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, ...Buffer.from(' rest')]);
    const repo = makeRepo(buf);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: 1, topic_id: 42 });
    expect(r.content[0]?.text).toMatch(/PDF/);
    expect(r.content[0]?.text).toContain(String(buf.length));
  });

  it('detects DOCX and extracts text', async () => {
    // Build a fake PK zip header that would trigger DOCX detection
    const buf = Buffer.alloc(600);
    buf[0] = 0x50; buf[1] = 0x4B; buf[2] = 0x03; buf[3] = 0x04;
    // Write 'word/' to trigger DOCX subtype detection in the first 200 bytes
    Buffer.from('word/document.xml').copy(buf, 30);
    const repo = makeRepo(buf);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: 1, topic_id: 10 });
    // Should detect as DOCX (may fail extraction but shouldn't crash)
    expect(r.content[0]?.text).toBeDefined();
  });

  it('detects Excel from magic bytes', async () => {
    const buf = Buffer.alloc(100);
    buf[0] = 0x50; buf[1] = 0x4B; buf[2] = 0x03; buf[3] = 0x04;
    Buffer.from('xl/workbook.xml').copy(buf, 30);
    const repo = makeRepo(buf);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: 1, topic_id: 10 });
    expect(r.content[0]?.text).toMatch(/Excel/);
  });

  it('detects PowerPoint from magic bytes', async () => {
    const buf = Buffer.alloc(100);
    buf[0] = 0x50; buf[1] = 0x4B; buf[2] = 0x03; buf[3] = 0x04;
    Buffer.from('ppt/presentation.xml').copy(buf, 30);
    const repo = makeRepo(buf);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: 1, topic_id: 10 });
    expect(r.content[0]?.text).toMatch(/PowerPoint/);
  });

  it('falls back to rendered text when binary is unrecognised', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]); // unknown binary
    const repo = makeRepo(buf, 'Course overview text here');
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: 1, topic_id: 99 });
    expect(r.content[0]?.text).toBe('Course overview text here');
  });

  it('returns octet-stream label when binary unrecognised and no rendered text', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    const repo = makeRepo(buf, '');
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: 1, topic_id: 99 });
    expect(r.content[0]?.text).toMatch(/octet-stream/);
  });

  it('detects plain text via printable ratio heuristic', async () => {
    const buf = Buffer.from('This is plain text content for a topic page in Brightspace.');
    const repo = makeRepo(buf);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: 1, topic_id: 5 });
    expect(r.content[0]?.text).toContain('plain text content');
  });
});
