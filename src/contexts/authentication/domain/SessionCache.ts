import type { Session } from './Session.js';

export interface SessionCache {
  get(profile: string): Promise<Session | null>;
  save(profile: string, session: Session): Promise<void>;
  invalidate(profile: string): Promise<void>;
}
