import { describe, expect, it } from 'vitest';

import { handleListNotifications } from '@/mcp/tools/list-notifications.tool.js';
import { Notification, type NotificationRepository } from '@/contexts/notifications/domain/Notification.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

const mkRepo = (items: Notification[]): NotificationRepository => ({
  findRecent: async () => items,
});

describe('handleListNotifications', () => {
  it('returns "no notifications" when empty', async () => {
    const result = await handleListNotifications({ notificationRepo: mkRepo([]), output: testOutputContext() }, {});
    expect(result.content[0]?.text).toContain('No notifications');
  });

  it('returns "no unread" when filter on but list empty', async () => {
    const result = await handleListNotifications({ notificationRepo: mkRepo([]), output: testOutputContext() }, { unread_only: true });
    expect(result.content[0]?.text).toContain('No unread');
  });

  it('renders mixed read/unread with course context and ● marker', async () => {
    const result = await handleListNotifications(
      { notificationRepo: mkRepo([
        new Notification({
          id: '1', orgUnitId: 100, orgUnitName: 'Lab Course',
          type: 'announcement', title: 'New post',
          body: '<p>Read me</p>', postedAt: new Date('2026-05-01T12:00:00Z'),
          isRead: false, url: null,
        }),
        new Notification({
          id: '2', orgUnitId: null, orgUnitName: null,
          type: 'reminder', title: 'Quiz tomorrow',
          body: null, postedAt: new Date('2026-04-30T08:00:00Z'),
          isRead: true, url: null,
        }),
      ]), output: testOutputContext() },
      {},
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Lab Course');
    expect(text).toContain('New post');
    expect(text).toContain('●');             // unread marker
    expect(text).toContain('Read me');       // body html stripped
  });
});
