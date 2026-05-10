import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleGetAssignmentFiles } from '@/mcp/tools/get-assignment-files.tool.js';
import type { AssignmentRepository, AssignmentFile } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';

const fakeRepo = (overrides: Partial<AssignmentRepository> = {}): AssignmentRepository => ({
  findByCourse: async () => [],
  findFeedback: async () => null,
  submit: async () => { throw new Error('not implemented'); },
  findFiles: async () => ({
    assignmentId: '42',
    assignmentName: 'Lab 1',
    instructions: 'Do the lab',
    files: [
      { name: 'template.docx', url: '/d2l/api/le/1.93/100/dropbox/folders/42/attachments/9001' },
      { name: 'rubric.pdf', url: '/d2l/api/le/1.93/100/dropbox/folders/42/attachments/9002' },
    ],
    fileContents: {
      'template.docx': '[DOCX text extracted]',
      'rubric.pdf': '[PDF — 1024 bytes]',
    },
  }),
  findFileBinary: async (_, file: AssignmentFile) =>
    Buffer.from(`<binary of ${file.name}>`),
  ...overrides,
});

const fakeContentRepo: ContentRepository = {
  findModules: async () => [],
  findSyllabus: async () => null,
  findTopicFile: async () => Buffer.from(''),
  findTopicRenderedText: async () => null,
};

describe('handleGetAssignmentFiles — save_to', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'assignfiles-'));
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('saves each attachment to disk when save_to is provided', async () => {
    const saveDir = join(tmp, 'lab1-files');
    const result = await handleGetAssignmentFiles(
      { assignmentRepo: fakeRepo(), contentRepo: fakeContentRepo },
      { course_id: 100, assignment_id: 42, save_to: saveDir },
    );
    const text = result.content[0]?.text ?? '';

    // Both files exist on disk with correct contents
    const f1 = join(saveDir, 'template.docx');
    const f2 = join(saveDir, 'rubric.pdf');
    expect(existsSync(f1)).toBe(true);
    expect(existsSync(f2)).toBe(true);
    expect(readFileSync(f1, 'utf8')).toBe('<binary of template.docx>');
    expect(readFileSync(f2, 'utf8')).toBe('<binary of rubric.pdf>');

    // Output text reflects the saved paths
    expect(text).toContain(`[Saved to: ${f1}]`);
    expect(text).toContain(`[Saved to: ${f2}]`);
    // And still contains extracted text for AI consumption
    expect(text).toContain('[DOCX text extracted]');
  });

  it('does NOT touch disk when save_to is omitted', async () => {
    const result = await handleGetAssignmentFiles(
      { assignmentRepo: fakeRepo(), contentRepo: fakeContentRepo },
      { course_id: 100, assignment_id: 42 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).not.toContain('[Saved to:');
  });

  it('reports save failure inline without aborting the whole tool call', async () => {
    const saveDir = join(tmp, 'with-bad-binary');
    const repo = fakeRepo({
      findFileBinary: async (_, file: AssignmentFile) => {
        if (file.name === 'rubric.pdf') throw new Error('network blew up');
        return Buffer.from('ok');
      },
    });
    const result = await handleGetAssignmentFiles(
      { assignmentRepo: repo, contentRepo: fakeContentRepo },
      { course_id: 100, assignment_id: 42, save_to: saveDir },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain(`[Saved to: ${join(saveDir, 'template.docx')}]`);
    expect(text).toContain('[Save failed: network blew up]');
    // The successful one is still on disk
    expect(existsSync(join(saveDir, 'template.docx'))).toBe(true);
  });
});
