import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import {
  Notification,
  type NotificationRepository,
} from '@/contexts/notifications/domain/Notification.js';

interface UpdatesItemDto {
  Id?: string | number;
  OrgUnitId?: number | null;
  OrgUnitName?: string | null;
  Type?: string;
  ItemName?: string;
  Description?: string | null;
  PostedDate?: string;
  IsRead?: boolean;
  Url?: string | null;
}

interface UpdatesResponseDto {
  Updates?: UpdatesItemDto[];
}

export interface D2lNotificationRepositoryOptions {
  /**
   * D2L doesn't expose a single canonical version for the user-updates
   * endpoint (`/d2l/api/lp/{ver}/feed/`). Most tenants accept the same `lp`
   * version we discovered for everything else.
   */
  lp: string;
}

/**
 * Adapter for the D2L user-updates / activity feed endpoint
 * (`/d2l/api/lp/{ver}/feed/myFeed/`). The exact response shape varies by
 * D2L version; we normalize a permissive subset and tolerate missing fields.
 *
 * If the endpoint returns 404 (some tenants disable it) the repository
 * returns an empty list rather than failing — read-only feed is purely
 * informational.
 */
export class D2lNotificationRepository implements NotificationRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lNotificationRepositoryOptions,
  ) {}

  async findRecent(opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<Notification[]> {
    let response: UpdatesResponseDto;
    try {
      response = await this.client.get<UpdatesResponseDto>(
        `/d2l/api/lp/${this.versions.lp}/feed/myFeed/`,
      );
    } catch {
      return [];
    }
    const items = response.Updates ?? [];
    let filtered = items
      .filter((dto): dto is UpdatesItemDto & { ItemName: string; PostedDate: string } =>
        typeof dto.ItemName === 'string' && typeof dto.PostedDate === 'string',
      )
      .map((dto) => new Notification({
        id: String(dto.Id ?? `${dto.ItemName}-${dto.PostedDate}`),
        orgUnitId: typeof dto.OrgUnitId === 'number' ? dto.OrgUnitId : null,
        orgUnitName: dto.OrgUnitName ?? null,
        type: dto.Type ?? 'unknown',
        title: dto.ItemName,
        body: dto.Description ?? null,
        postedAt: new Date(dto.PostedDate),
        isRead: dto.IsRead ?? false,
        url: dto.Url ?? null,
      }));

    if (opts.unreadOnly) filtered = filtered.filter((n) => !n.isRead);
    filtered.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
    if (opts.limit) filtered = filtered.slice(0, opts.limit);
    return filtered;
  }
}
