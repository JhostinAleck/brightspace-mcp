import { z } from 'zod';

import type { NotificationRepository } from '@/contexts/notifications/domain/Notification.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export const listNotificationsSchema = z.object({
  unread_only: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(25),
}).strict();

export interface ListNotificationsDeps {
  notificationRepo: NotificationRepository;
  output: OutputContext;
}

export async function handleListNotifications(deps: ListNotificationsDeps, rawInput: unknown) {
  const input = listNotificationsSchema.parse(rawInput);
  const items = await deps.notificationRepo.findRecent({
    unreadOnly: input.unread_only,
    limit: input.limit,
  });

  if (items.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: input.unread_only ? 'No unread notifications.' : 'No notifications.',
      }],
    };
  }

  const lines = items.map((n) => {
    const flag = n.isRead ? '   ' : ' ●';
    const ctx = n.orgUnitName ? ` [${n.orgUnitName}]` : '';
    const body = n.body ? `\n   ${n.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}` : '';
    return `${flag} ${n.postedAt.toISOString()} — ${n.type}${ctx}: ${n.title}${body}`;
  });
  return {
    content: [{
      type: 'text' as const,
      text: `Notifications (${items.length}${input.unread_only ? ' unread' : ''}):\n${lines.join('\n')}${deps.output.metaFooter() ? `\n\n${deps.output.metaFooter()}` : ''}`,
    }],
  };
}
