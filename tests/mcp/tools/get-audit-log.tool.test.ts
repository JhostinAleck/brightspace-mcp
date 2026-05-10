import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleGetAuditLog } from '@/mcp/tools/get-audit-log.tool.js';

describe('handleGetAuditLog', () => {
  let tmp: string;
  let logPath: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'audit-tool-'));
    logPath = join(tmp, 'audit.log');
    const lines = [
      { audit_ts: '2026-05-09T10:00:00.000Z', event: 'write_attempt', cid: 'c1', tool: 'submit_assignment', args: { course_id: '1' } },
      { audit_ts: '2026-05-09T11:00:00.000Z', event: 'write_attempt', cid: 'c2', tool: 'post_discussion_reply', args: { topic_id: '99' } },
      { audit_ts: '2026-05-09T12:00:00.000Z', event: 'write_attempt', cid: 'c3', tool: 'submit_assignment', args: { course_id: '2' } },
    ];
    writeFileSync(logPath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  });
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns the most recent entries first', async () => {
    const result = await handleGetAuditLog({ auditLogPath: logPath }, { limit: 10 });
    const text = result.content[0]?.text ?? '';
    const c3Idx = text.indexOf('cid=c3');
    const c1Idx = text.indexOf('cid=c1');
    expect(c3Idx).toBeGreaterThan(-1);
    expect(c1Idx).toBeGreaterThan(-1);
    expect(c3Idx).toBeLessThan(c1Idx); // newest first
  });

  it('filters by tool name', async () => {
    const result = await handleGetAuditLog({ auditLogPath: logPath }, { tool: 'submit_assignment', limit: 10 });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('cid=c3');
    expect(text).toContain('cid=c1');
    expect(text).not.toContain('cid=c2');
  });

  it('filters by `since` timestamp', async () => {
    const result = await handleGetAuditLog(
      { auditLogPath: logPath },
      { since: '2026-05-09T10:30:00.000Z', limit: 10 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('cid=c3');
    expect(text).toContain('cid=c2');
    expect(text).not.toContain('cid=c1');
  });

  it('returns "no audit log yet" when file does not exist', async () => {
    const result = await handleGetAuditLog({ auditLogPath: '/nonexistent/path.log' }, {});
    expect(result.content[0]?.text).toContain('No audit log yet');
  });

  it('skips corrupt JSON lines without failing', async () => {
    const corruptPath = join(tmp, 'corrupt.log');
    writeFileSync(corruptPath,
      '{"audit_ts":"2026-05-09T10:00:00Z","tool":"submit_assignment","cid":"ok"}\n' +
      'this-is-not-json\n' +
      '{"audit_ts":"2026-05-09T11:00:00Z","tool":"submit_assignment","cid":"ok2"}\n',
    );
    const result = await handleGetAuditLog({ auditLogPath: corruptPath }, { limit: 10 });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('cid=ok');
    expect(text).toContain('cid=ok2');
  });
});
