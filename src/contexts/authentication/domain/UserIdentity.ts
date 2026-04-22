import type { UserId } from '@/shared-kernel/types/UserId.js';

export interface UserIdentity {
  readonly userId: UserId;
  readonly displayName: string;
  readonly uniqueName: string;
}
