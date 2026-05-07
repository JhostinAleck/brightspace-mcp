import type { RedisLikeClient } from '@/shared-kernel/cache/RedisCache.js';
import type { SessionCache } from '@/contexts/authentication/domain/SessionCache.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';
import { AccessToken, type AccessTokenJson } from '@/contexts/authentication/domain/AccessToken.js';
import { UserId } from '@/shared-kernel/types/UserId.js';

interface StoredSession {
  token: AccessTokenJson;
  profile: string;
  issuedAtIso: string;
  expiresAtIso: string;
  source: Session['source'];
  userIdentity: {
    userIdNumber: number;
    displayName: string;
    uniqueName: string;
  };
}

export interface RedisSessionCacheOptions {
  loader: () => Promise<RedisLikeClient>;
  keyPrefix: string;
}

export class RedisSessionCache implements SessionCache {
  private clientPromise: Promise<RedisLikeClient> | null = null;

  constructor(private readonly opts: RedisSessionCacheOptions) {}

  private async client(): Promise<RedisLikeClient> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        try {
          return await this.opts.loader();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `ioredis is not available (${message}). Install the optional "ioredis" dependency or switch to memory/file cache backend.`,
            { cause: err },
          );
        }
      })();
    }
    return this.clientPromise;
  }

  private key(profile: string): string {
    return `${this.opts.keyPrefix}session:${profile}`;
  }

  private toStored(session: Session): StoredSession {
    return {
      token: session.token.toPersistable(),
      profile: session.profile,
      issuedAtIso: session.issuedAt.toISOString(),
      expiresAtIso: session.expiresAt.toISOString(),
      source: session.source,
      userIdentity: {
        userIdNumber: UserId.toNumber(session.userIdentity.userId),
        displayName: session.userIdentity.displayName,
        uniqueName: session.userIdentity.uniqueName,
      },
    };
  }

  private fromStored(entry: StoredSession): Session {
    return {
      token: AccessToken.fromPersistable(entry.token),
      profile: entry.profile,
      issuedAt: new Date(entry.issuedAtIso),
      expiresAt: new Date(entry.expiresAtIso),
      source: entry.source,
      userIdentity: {
        userId: UserId.of(entry.userIdentity.userIdNumber),
        displayName: entry.userIdentity.displayName,
        uniqueName: entry.userIdentity.uniqueName,
      },
    };
  }

  async get(profile: string): Promise<Session | null> {
    const client = await this.client();
    const raw = await client.get(this.key(profile));
    if (raw === null) return null;
    const entry = JSON.parse(raw) as StoredSession;
    const expiresAt = new Date(entry.expiresAtIso);
    if (expiresAt.getTime() <= Date.now()) return null;
    return this.fromStored(entry);
  }

  async save(profile: string, session: Session): Promise<void> {
    const ttlMs = session.expiresAt.getTime() - Date.now();
    if (ttlMs <= 0) return;
    const client = await this.client();
    await client.set(this.key(profile), JSON.stringify(this.toStored(session)), 'PX', ttlMs);
  }

  async invalidate(profile: string): Promise<void> {
    const client = await this.client();
    await client.del(this.key(profile));
  }
}
