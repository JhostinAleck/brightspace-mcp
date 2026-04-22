import type { SessionCache } from '@/contexts/authentication/domain/SessionCache.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';

export class InMemorySessionCache implements SessionCache {
  private readonly store = new Map<string, Session>();

  async get(profile: string): Promise<Session | null> {
    const s = this.store.get(profile);
    if (!s) return null;
    if (s.expiresAt.getTime() <= Date.now()) {
      this.store.delete(profile);
      return null;
    }
    return s;
  }

  async save(profile: string, session: Session): Promise<void> {
    this.store.set(profile, session);
  }

  async invalidate(profile: string): Promise<void> {
    this.store.delete(profile);
  }
}
