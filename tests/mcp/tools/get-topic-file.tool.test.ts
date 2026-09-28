import { describe, it, expect, vi, beforeAll } from 'vitest';
import { handleGetTopicFile } from '@/mcp/tools/get-topic-file.tool';
import { Module } from '@/contexts/content/domain/Module';
import { Topic, type TopicProps } from '@/contexts/content/domain/Topic';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';
import { TINY_PNG, buildDocx, buildPdf, buildPptx, buildXlsx, warmPdfParser } from '@tests/helpers/zip';

beforeAll(warmPdfParser, 60_000);

const COURSE = 1;

function topic(p: Partial<TopicProps> & { id: number }): Topic {
  return new Topic({ title: `Topic ${p.id}`, kind: 'file', url: null, fileExtension: null, ...p });
}

function makeRepo(fileBuf: Buffer, renderedText = '', topics: Topic[] = []): FakeContentRepository {
  const mods = topics.length ? [new Module({ id: 1, title: 'M', topics, submodules: [] })] : [];
  const repo = new FakeContentRepository(new Map(), new Map([[COURSE, mods]]));
  repo.findTopicFile = async () => fileBuf;
  repo.findTopicRenderedText = async () => renderedText;
  return repo;
}

function text(r: { content: Array<{ type: string; text?: string }> }): string {
  return r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

describe('get_topic_file tool', () => {
  it('extracts PDF text', async () => {
    const repo = makeRepo(buildPdf(['Sprint 1 Solution context']));
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 42 });
    expect(text(r)).toContain('Sprint 1 Solution context');
  });

  it('reports an unreadable PDF with its size', async () => {
    const buf = Buffer.from('%PDF-1.4 broken');
    const r = await handleGetTopicFile({ contentRepo: makeRepo(buf) }, { course_id: COURSE, topic_id: 42 });
    expect(text(r)).toMatch(/PDF/);
    expect(text(r)).toContain(String(buf.length));
  });

  it('extracts real Office files whose first zip entry is [Content_Types].xml', async () => {
    const docx = await handleGetTopicFile({ contentRepo: makeRepo(buildDocx(['Taller 3 instrucciones'])) }, { course_id: COURSE, topic_id: 10 });
    expect(text(docx)).toContain('Taller 3 instrucciones');
    const pptx = await handleGetTopicFile({ contentRepo: makeRepo(buildPptx([['Complementaria 1'], ['Repaso']])) }, { course_id: COURSE, topic_id: 10 });
    expect(text(pptx)).toContain('Complementaria 1');
    expect(text(pptx)).not.toMatch(/ZIP/);
  });

  it('uses the topic URL extension for .xlsm (served as d2l/unknowntype)', async () => {
    const repo = makeRepo(buildXlsx([['Punto', 'Nota'], ['1a', '4']]), '', [
      topic({ id: 11, url: '/content/enforced/1-X/Retro.xlsm', fileExtension: 'xlsm' }),
    ]);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 11 });
    expect(text(r)).toContain('1a\t4');
  });

  it('renders notebooks as cells and keeps CSV newlines', async () => {
    const nb = JSON.stringify({ cells: [{ cell_type: 'markdown', source: ['# Lab 1'] }, { cell_type: 'code', source: ['x = 1'] }] });
    const repo = makeRepo(Buffer.from(nb), '', [topic({ id: 12, url: '/content/enforced/1-X/Lab_1.ipynb', fileExtension: 'ipynb' })]);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 12 });
    expect(text(r)).toContain('# Lab 1');
    expect(text(r)).toContain('```python\nx = 1\n```');

    const csvRepo = makeRepo(Buffer.from('a,b\n1,2\n'), '', [topic({ id: 13, url: '/content/enforced/1-X/d.csv', fileExtension: 'csv' })]);
    expect(text(await handleGetTopicFile({ contentRepo: csvRepo }, { course_id: COURSE, topic_id: 13 }))).toContain('a,b\n1,2');
  });

  it('returns images as MCP image content instead of rendering the D2L page', async () => {
    const repo = makeRepo(TINY_PNG, 'Menu  Jane Student  Settings', [
      topic({ id: 14, url: '/content/enforced/1-X/Rubric.png', fileExtension: 'png' }),
    ]);
    const rendered = vi.spyOn(repo, 'findTopicRenderedText');
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 14 });
    const img = r.content.find((c) => c.type === 'image') as { data: string; mimeType: string } | undefined;
    expect(img?.mimeType).toBe('image/png');
    expect(img?.data).toBe(TINY_PNG.toString('base64'));
    expect(rendered).not.toHaveBeenCalled();
    expect(text(r)).not.toContain('Jane Student');
  });

  it('returns metadata only for audio/video', async () => {
    const repo = makeRepo(Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000'), 'page chrome', [
      topic({ id: 15, url: '/content/enforced/1-X/numeros.mp3', fileExtension: 'mp3' }),
    ]);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 15 });
    expect(text(r)).toMatch(/audio/i);
    expect(text(r)).not.toContain('page chrome');
  });

  it('never uses the rendered-page fallback for unknown binaries', async () => {
    const repo = makeRepo(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]), 'Menu  Jane Student');
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 99 });
    expect(text(r)).toMatch(/octet-stream/);
    expect(text(r)).not.toContain('Jane Student');
  });

  it('falls back to the rendered page for HTML topics with no extractable text', async () => {
    const repo = makeRepo(Buffer.from('<!DOCTYPE html><html><body><div id="app"></div></body></html>'), 'Rendered SPA text', [
      topic({ id: 16, url: '/content/enforced/1-X/app.html', fileExtension: 'html' }),
    ]);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 16 });
    expect(text(r)).toContain('Rendered SPA text');
  });

  it('resolves relative links in HTML topics to /content/enforced paths usable with get_course_file', async () => {
    const html = '<!DOCTYPE html><html><body><a href="1_RECURSOS/Welcome/ISIS3510-syllabus.pdf?ou=486307">¡¡ CHECK THE SYLLABUS HERE !!</a></body></html>';
    const repo = makeRepo(Buffer.from(html), '', [
      topic({ id: 3396113, url: '/content/enforced/486307-202620_ISIS3510_5/Welcome.html', fileExtension: 'html' }),
    ]);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 3396113 });
    expect(text(r)).toContain('¡¡ CHECK THE SYLLABUS HERE !! (/content/enforced/486307-202620_ISIS3510_5/1_RECURSOS/Welcome/ISIS3510-syllabus.pdf?ou=486307)');
    expect(text(r)).toContain('get_course_file');
  });

  it('keeps the href of an embedded link when the topic is unknown', async () => {
    const html = '<!DOCTYPE html><html><body><a href="1_RECURSOS/syllabus.pdf">Syllabus</a></body></html>';
    const r = await handleGetTopicFile({ contentRepo: makeRepo(Buffer.from(html)) }, { course_id: COURSE, topic_id: 5 });
    expect(text(r)).toContain('Syllabus (1_RECURSOS/syllabus.pdf)');
  });

  it('says when the output was truncated', async () => {
    const repo = makeRepo(Buffer.from('wordy'.repeat(20_000)), '', [topic({ id: 17, url: '/content/enforced/1-X/big.txt', fileExtension: 'txt' })]);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 17 });
    expect(text(r)).toMatch(/truncated/i);
    expect(text(r)).toContain('100000');
  });

  it('explains link topics instead of requesting /file (which 404s)', async () => {
    const repo = makeRepo(Buffer.alloc(0), '', [topic({ id: 20, title: 'Clase grabada', kind: 'link', url: 'https://youtu.be/abc' })]);
    const dl = vi.spyOn(repo, 'findTopicFile');
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 20 });
    expect(dl).not.toHaveBeenCalled();
    expect(text(r)).toContain('https://youtu.be/abc');
    expect(text(r)).toMatch(/link/i);
  });

  it('points quiz quicklinks to the quiz tools and LTI topics to Brightspace', async () => {
    const repo = makeRepo(Buffer.alloc(0), '', [
      topic({ id: 21, kind: 'quiz', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=quiz' }),
      topic({ id: 22, kind: 'lti', url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1&type=lti' }),
    ]);
    expect(text(await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 21 }))).toContain('list_quizzes');
    expect(text(await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 22 }))).toMatch(/LTI/);
  });

  it('explains broken topics explicitly', async () => {
    const repo = makeRepo(Buffer.alloc(0), '', [topic({ id: 23, title: 'MS1-Optional.pdf', isBroken: true })]);
    const r = await handleGetTopicFile({ contentRepo: repo }, { course_id: COURSE, topic_id: 23 });
    expect(text(r)).toMatch(/broken/i);
    expect(text(r)).toContain('MS1-Optional.pdf');
  });
});
