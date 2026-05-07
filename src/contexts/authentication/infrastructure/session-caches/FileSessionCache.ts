import { readFile, writeFile, chmod, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import lockfile from 'proper-lockfile';
import type { SessionCache } from '@/contexts/authentication/domain/SessionCache.js';
import type { Session } from '@/contexts/authentication/domain/Session.js';
import {
  AccessToken,
  type AccessTokenJson,
} from '@/contexts/authentication/domain/AccessToken.js';
import { UserId } from '@/shared-kernel/types/UserId.js';

interface StoredEntry {
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

interface SessionFile {
  version: 1;
  entries: Record<string, StoredEntry>;
}

export interface FileSessionCacheOptions {
  path: string;
}

export class FileSessionCache implements SessionCache {
  constructor(private readonly opts: FileSessionCacheOptions) {}

  private toStored(session: Session): StoredEntry {
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

  private fromStored(entry: StoredEntry): Session {
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

  private async loadFile(): Promise<SessionFile> {
    if (!existsSync(this.opts.path)) return { version: 1, entries: {} };
    const text = await readFile(this.opts.path, 'utf8');
    const parsed = JSON.parse(text) as SessionFile;
    if (parsed.version !== 1) {
      throw new Error(`Unsupported session file version ${String(parsed.version)}`);
    }
    return parsed;
  }

  private async saveFile(file: SessionFile): Promise<void> {
    await mkdir(dirname(this.opts.path), { recursive: true });
    const tmp = `${this.opts.path}.tmp-${randomBytes(4).toString('hex')}`;
    await writeFile(tmp, JSON.stringify(file), { encoding: 'utf8' });
    if (process.platform !== 'win32') await chmod(tmp, 0o600);
    try {
      await rename(tmp, this.opts.path);
    } catch (err) {
      await unlink(tmp).catch(() => {
        /* best-effort */
      });
      throw err;
    }
  }

  private async withLock<T>(op: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.opts.path), { recursive: true });
    // proper-lockfile needs an existing file to lock. Create empty placeholder if missing.
    if (!existsSync(this.opts.path)) {
      await writeFile(
        this.opts.path,
        JSON.stringify({ version: 1, entries: {} }),
        { encoding: 'utf8' },
      );
      if (process.platform !== 'win32') await chmod(this.opts.path, 0o600);
    }
    const release = await lockfile.lock(this.opts.path, {
      realpath: false,
      retries: { retries: 10, factor: 1.2, minTimeout: 20, maxTimeout: 200 },
    });
    try {
      return await op();
    } finally {
      await release();
    }
  }

  /**
   * Lazy expiration: returns null for expired sessions without rewriting the
   * file. Garbage entries are reclaimed on the next `save` / `invalidate`.
   * Avoids turning every read into a locked write.
   */
  async get(profile: string): Promise<Session | null> {
    if (!existsSync(this.opts.path)) return null;
    let text: string;
    try {
      text = await readFile(this.opts.path, 'utf8');
    } catch {
      return null;
    }
    let parsed: SessionFile;
    try {
      parsed = JSON.parse(text) as SessionFile;
    } catch {
      return null;
    }
    if (parsed.version !== 1) return null;
    const entry = parsed.entries[profile];
    if (!entry) return null;
    const expiresAt = new Date(entry.expiresAtIso);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return this.fromStored(entry);
  }

  async save(profile: string, session: Session): Promise<void> {
    return this.withLock(async () => {
      const file = await this.loadFile();
      // Opportunistic GC of expired siblings while we own the lock.
      const now = Date.now();
      for (const k of Object.keys(file.entries)) {
        const e = file.entries[k];
        if (!e) continue;
        const t = Date.parse(e.expiresAtIso);
        if (Number.isFinite(t) && t <= now) delete file.entries[k];
      }
      file.entries[profile] = this.toStored(session);
      await this.saveFile(file);
    });
  }

  async invalidate(profile: string): Promise<void> {
    return this.withLock(async () => {
      if (!existsSync(this.opts.path)) return;
      const file = await this.loadFile();
      if (!(profile in file.entries)) return;
      delete file.entries[profile];
      if (Object.keys(file.entries).length === 0) {
        // Truncate to empty container — we hold the inode lock so we cannot
        // unlink without breaking the lock semantics.
        await this.saveFile({ version: 1, entries: {} });
        return;
      }
      await this.saveFile(file);
    });
  }
}
