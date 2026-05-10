import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import nock from 'nock';

import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lNotificationRepository } from '@/contexts/notifications/infrastructure/D2lNotificationRepository.js';

const BASE = 'https://sandbox.d2l.com';

function makeRepo(): D2lNotificationRepository {
  const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
  return new D2lNotificationRepository(client, { lp: '1.59' });
}

describe('D2lNotificationRepository', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('maps feed entries with newest-first ordering', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/feed/myFeed/').reply(200, {
      Updates: [
        { Id: '1', ItemName: 'Old', Type: 'announcement', PostedDate: '2026-04-01T08:00:00Z', IsRead: true },
        { Id: '2', ItemName: 'New', Type: 'reminder', PostedDate: '2026-04-02T08:00:00Z', IsRead: false },
      ],
    });
    const items = await makeRepo().findRecent();
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe('New');
    expect(items[1]!.title).toBe('Old');
  });

  it('filters to unread when unreadOnly=true', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/feed/myFeed/').reply(200, {
      Updates: [
        { Id: '1', ItemName: 'r', PostedDate: '2026-04-01T08:00:00Z', IsRead: true },
        { Id: '2', ItemName: 'u', PostedDate: '2026-04-02T08:00:00Z', IsRead: false },
      ],
    });
    const items = await makeRepo().findRecent({ unreadOnly: true });
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('u');
  });

  it('caps at limit', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/feed/myFeed/').reply(200, {
      Updates: [
        { ItemName: 'a', PostedDate: '2026-04-03T08:00:00Z' },
        { ItemName: 'b', PostedDate: '2026-04-02T08:00:00Z' },
        { ItemName: 'c', PostedDate: '2026-04-01T08:00:00Z' },
      ],
    });
    const items = await makeRepo().findRecent({ limit: 2 });
    expect(items).toHaveLength(2);
  });

  it('returns empty list when endpoint 404s (tenant disabled feed)', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/feed/myFeed/').reply(404, '');
    expect(await makeRepo().findRecent()).toEqual([]);
  });

  it('skips DTOs missing ItemName or PostedDate', async () => {
    nock(BASE).get('/d2l/api/lp/1.59/feed/myFeed/').reply(200, {
      Updates: [
        { ItemName: 'ok', PostedDate: '2026-04-01T08:00:00Z' },
        { ItemName: 'missing-date' },
        { PostedDate: '2026-04-02T08:00:00Z' },
      ],
    });
    const items = await makeRepo().findRecent();
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('ok');
  });
});
