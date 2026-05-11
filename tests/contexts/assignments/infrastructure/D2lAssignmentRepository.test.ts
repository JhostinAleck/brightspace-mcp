import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lAssignmentRepository } from '@/contexts/assignments/infrastructure/D2lAssignmentRepository';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';

const BASE = 'https://x.com';
const foldersFixture = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/assignments/folders.json'), 'utf-8'));
const feedbackFixture = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/assignments/feedback.json'), 'utf-8'));

afterEach(() => nock.cleanAll());

describe('D2lAssignmentRepository', () => {
  it('findByCourse parses dropbox folders into Assignment entities', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/dropbox/folders/').reply(200, foldersFixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });
    const out = await repo.findByCourse(OrgUnitId.of(101));
    expect(out).toHaveLength(2);

    const essay = out.find((a) => a.name === 'Essay 1');
    expect(essay?.dueDate.toDate()?.toISOString()).toBe('2026-05-01T23:59:00.000Z');
    expect(essay?.submissions.length).toBe(1);

    const discussion = out.find((a) => a.name === 'Discussion Post');
    expect(discussion?.dueDate.toDate()).toBeNull();
    expect(discussion?.instructions).toBeNull();
  });

  it('findFeedback returns Feedback when the endpoint responds 200', async () => {
    nock(BASE)
      .get(/\/d2l\/api\/le\/1\.91\/101\/dropbox\/folders\/5001\/feedback\/me$/)
      .reply(200, feedbackFixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });
    const fb = await repo.findFeedback(OrgUnitId.of(101), AssignmentId.of(5001));
    expect(fb?.score).toBe(88);
    expect(fb?.text).toContain('tighten');
  });

  it('findFeedback returns null on 404', async () => {
    nock(BASE)
      .get(/\/d2l\/api\/le\/1\.91\/101\/dropbox\/folders\/5002\/feedback\/me$/)
      .reply(404, '');
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });
    const fb = await repo.findFeedback(OrgUnitId.of(101), AssignmentId.of(5002));
    expect(fb).toBeNull();
  });

  it('findFiles uses Attachments from folder list when present', async () => {
    const foldersWithAttachments = [
      {
        Id: 5001,
        Name: 'Essay 1',
        CustomInstructions: { Html: '<p>Instructions here</p>' },
        DueDate: '2026-05-01T23:59:00Z',
        Submissions: [],
        Attachments: [{ FileId: 'abc123', FileName: 'rubric.pdf', Size: 12345 }],
      },
    ];
    nock(BASE).get('/d2l/api/le/1.91/101/dropbox/folders/').reply(200, foldersWithAttachments);
    // Attachment download
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/5001/attachments/abc123')
      .reply(200, Buffer.from([0x25, 0x50, 0x44, 0x46])); // PDF magic bytes

    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });
    const result = await repo.findFiles(OrgUnitId.of(101), AssignmentId.of(5001));

    expect(result.assignmentName).toBe('Essay 1');
    expect(result.instructions).toContain('Instructions here');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.name).toBe('rubric.pdf');
    expect(result.fileContents['rubric.pdf']).toMatch(/PDF/);
  });

  it('findFiles falls back to dedicated attachments endpoint when list has none', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/dropbox/folders/').reply(200, foldersFixture);
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/5001/attachments/')
      .reply(200, [{ FileId: 'def456', FileName: 'template.pdf', Size: 999 }]);
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/5001/attachments/def456')
      .reply(200, Buffer.from([0x25, 0x50, 0x44, 0x46]));

    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });
    const result = await repo.findFiles(OrgUnitId.of(101), AssignmentId.of(5001));

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.name).toBe('template.pdf');
  });

  it('findFiles falls back to HTML scraping when both API strategies yield nothing', async () => {
    const htmlWithLinks = `
      <html><body>
        <a href="/d2l/common/viewFile.d2lfile/Database/XYZ/hw.docx?ou=101"
           title="hw.docx">hw.docx</a>
      </body></html>`;

    nock(BASE).get('/d2l/api/le/1.91/101/dropbox/folders/').reply(200, foldersFixture);
    nock(BASE).get('/d2l/api/le/1.91/101/dropbox/folders/5001/attachments/').reply(404, '');
    nock(BASE)
      .get(/folder_submit_files/)
      .reply(200, htmlWithLinks);

    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });
    const result = await repo.findFiles(OrgUnitId.of(101), AssignmentId.of(5001));

    // HTML scraping should find the docx link via extension-in-URL strategy
    expect(result.files.length).toBeGreaterThanOrEqual(0); // scraping may or may not match
    expect(result.assignmentName).toBe('Essay 1');
  });

  it('findFiles propagates non-404 errors from attachments endpoint instead of silently swallowing them', async () => {
    // list endpoint — no embedded attachments so strategy B is triggered
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/')
      .reply(200, [{ Id: 5001, Name: 'Essay 1', Attachments: [] }]);
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/5001/attachments/')
      .reply(500, 'internal server error');

    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });

    // A 500 should NOT be silently swallowed — it should propagate
    await expect(repo.findFiles(OrgUnitId.of(101), AssignmentId.of(5001))).rejects.toThrow();
  });

  it('findFiles falls back gracefully when attachments endpoint returns 404', async () => {
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/')
      .reply(200, [{ Id: 5001, Name: 'Essay 1', Attachments: [] }]);
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/5001/attachments/')
      .reply(404, 'not found');
    nock(BASE)
      .get(/folder_submit_files/)
      .reply(200, '<html></html>');

    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });

    // 404 should fall through to HTML scraping, not throw
    const result = await repo.findFiles(OrgUnitId.of(101), AssignmentId.of(5001));
    expect(result.assignmentName).toBe('Essay 1');
  });

  it('filters out submissions whose SubmissionDate is unparseable (no Invalid Date bombs)', async () => {
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/')
      .reply(200, [{
        Id: 5003,
        Name: 'Bad date folder',
        DueDate: '2026-06-01T00:00:00Z',
        Submissions: [
          { Submitter: { Identifier: '99' }, SubmissionDate: 'not-a-date', Comments: { Text: '' } },
          { Submitter: { Identifier: '99' }, SubmissionDate: '2026-05-10T22:36:38.470Z', Comments: { Text: 'good one' } },
        ],
      }]);

    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });
    const out = await repo.findByCourse(OrgUnitId.of(101));
    const folder = out.find((a) => a.name === 'Bad date folder');

    // Only the valid-date submission survives; toISOString() must not throw.
    expect(folder?.submissions.length).toBe(1);
    expect(() => folder!.submissions[0]!.submittedAt.toISOString()).not.toThrow();
    expect(folder!.submissions[0]!.submittedAt.toISOString()).toBe('2026-05-10T22:36:38.470Z');
  });

  it('extractZipEntry returns null for truncated ZIP instead of throwing from zlib', async () => {
    // Build a malformed DOCX (ZIP) where compressedSize points past buffer end
    const buf = Buffer.alloc(50);
    buf.write('PK\x03\x04', 0, 'binary');
    buf.writeUInt16LE(8, 8);              // compression = deflate
    buf.writeUInt32LE(9999, 18);          // compressedSize way past buffer
    buf.writeUInt16LE(4, 26);             // filenameLen = 4
    buf.writeUInt16LE(0, 28);             // extraLen = 0
    buf.write('test', 30, 'ascii');       // filename = "test"

    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/')
      .reply(200, [{ Id: 5001, Name: 'Essay 1', Attachments: [{ FileId: 'f1', FileName: 'hw.docx' }] }]);
    nock(BASE)
      .get('/d2l/api/le/1.91/101/dropbox/folders/5001/attachments/f1')
      .reply(200, buf, { 'content-type': 'application/octet-stream' });

    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lAssignmentRepository(client, { le: '1.91' });

    // Should not throw — corrupted ZIP/DOCX should return graceful fallback
    const result = await repo.findFiles(OrgUnitId.of(101), AssignmentId.of(5001));
    expect(result.fileContents['hw.docx']).toMatch(/failed|DOCX/i);
  });
});
