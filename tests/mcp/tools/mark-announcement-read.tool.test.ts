import { describe, expect, it } from 'vitest';

import {
  handleMarkAnnouncementRead,
  type MarkAnnouncementReadParams,
} from '@/mcp/tools/mark-announcement-read.tool.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import { InMemoryIdempotencyStore } from '@/shared-kernel/idempotency/IdempotencyStore.js';
import { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';
import { WritesGate } from '@/shared-kernel/writes/WritesGate.js';

function makeDeps(
  gate: WritesGate,
  markImpl: CommunicationsRepository['markAnnouncementRead'] = async () => {},
) {
  const repo = {
    findAnnouncements: async () => [],
    findDiscussions: async () => [],
    postReply: async () => ({ postId: 'p', postedAt: new Date() }),
    markAnnouncementRead: markImpl,
  } as unknown as CommunicationsRepository;
  return {
    communicationsRepo: repo,
    idempotencyStore: new InMemoryIdempotencyStore(),
    auditLogger: new AuditLogger({ logger: { warn: () => undefined } as never }),
    writesGate: gate,
  };
}

const sampleParams: MarkAnnouncementReadParams = {
  course_id: '100',
  announcement_id: 'ann-42',
  idempotency_key: 'idem-ack-12345',
};

describe('handleMarkAnnouncementRead', () => {
  it('marks as read on first call', async () => {
    let calls = 0;
    const deps = makeDeps(
      new WritesGate({ configEnabled: true, cliFlag: true }),
      async () => {
        calls++;
      },
    );
    const result = await handleMarkAnnouncementRead(sampleParams, deps);
    expect(calls).toBe(1);
    expect(result.content[0]?.text).toContain('ann-42');
    expect(result.content[0]?.text).toContain('Marked');
  });

  it('returns cached response on idempotent replay', async () => {
    let calls = 0;
    const deps = makeDeps(
      new WritesGate({ configEnabled: true, cliFlag: true }),
      async () => {
        calls++;
      },
    );
    await handleMarkAnnouncementRead(sampleParams, deps);
    const r2 = await handleMarkAnnouncementRead(sampleParams, deps);
    expect(calls).toBe(1);
    expect(r2.content[0]?.text).toContain('replay');
  });

  it('returns dry-run preview when writesGate.isDryRun is true', async () => {
    let calls = 0;
    const deps = makeDeps(
      new WritesGate({ configEnabled: true, cliFlag: true, configDryRun: true }),
      async () => {
        calls++;
      },
    );
    const result = await handleMarkAnnouncementRead(sampleParams, deps);
    expect(calls).toBe(0);
    expect(result.content[0]?.text).toContain('[dry-run]');
  });
});
