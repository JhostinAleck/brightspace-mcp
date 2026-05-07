import { readFile, writeFile, mkdir, rename, unlink, chmod } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import lockfile from 'proper-lockfile';
import type { Cache } from './Cache.js';

interface Entry { value: unknown; expiresAt: number; }
interface CacheFile { version: 1; entries: Record<string, Entry>; }

export interface FileCacheOptions {
  path: string;
}

function newCacheFile(): CacheFile {
  return { version: 1, entries: {} };
}

export class FileCache implements Cache {
  constructor(private readonly opts: FileCacheOptions) {}

  private async ensureExists(): Promise<void> {
    await mkdir(dirname(this.opts.path), { recursive: true });
    if (!existsSync(this.opts.path)) {
      writeFileSync(this.opts.path, JSON.stringify(newCacheFile()), 'utf8');
      if (process.platform !== 'win32') await chmod(this.opts.path, 0o600);
    }
  }

  private async load(): Promise<CacheFile> {
    if (!existsSync(this.opts.path)) return newCacheFile();
    const text = await readFile(this.opts.path, 'utf8');
    const parsed = JSON.parse(text) as CacheFile;
    if (parsed.version !== 1) throw new Error(`Unsupported cache file version ${String(parsed.version)}`);
    return parsed;
  }

  private async save(file: CacheFile): Promise<void> {
    await mkdir(dirname(this.opts.path), { recursive: true });
    const tmp = `${this.opts.path}.tmp-${randomBytes(4).toString('hex')}`;
    await writeFile(tmp, JSON.stringify(file), { encoding: 'utf8' });
    if (process.platform !== 'win32') await chmod(tmp, 0o600);
    try {
      await rename(tmp, this.opts.path);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }

  private async withLock<T>(op: () => Promise<T>): Promise<T> {
    await this.ensureExists();
    const release = await lockfile.lock(this.opts.path, {
      realpath: false,
      retries: { retries: 10, factor: 1.2, minTimeout: 20, maxTimeout: 200 },
    });
    try { return await op(); } finally { await release(); }
  }

  /**
   * Lazy expiration: a `get` on an expired entry returns null without
   * rewriting the file. Garbage entries are reclaimed on the next `set` or
   * `clear`. This avoids turning every read into a write and keeps reads
   * lock-free except for the file open/parse cost.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!existsSync(this.opts.path)) return null;
    let text: string;
    try {
      text = await readFile(this.opts.path, 'utf8');
    } catch {
      return null;
    }
    let parsed: CacheFile;
    try {
      parsed = JSON.parse(text) as CacheFile;
    } catch {
      return null;
    }
    if (parsed.version !== 1) return null;
    const entry = parsed.entries[key];
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) return null;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    return this.withLock(async () => {
      const file = await this.load();
      // Opportunistic GC: drop expired siblings while we hold the write lock.
      const now = Date.now();
      for (const k of Object.keys(file.entries)) {
        const e = file.entries[k];
        if (e && e.expiresAt <= now) delete file.entries[k];
      }
      file.entries[key] = { value, expiresAt: now + ttlMs };
      await this.save(file);
    });
  }

  async delete(key: string): Promise<void> {
    return this.withLock(async () => {
      const file = await this.load();
      if (!(key in file.entries)) return;
      delete file.entries[key];
      await this.save(file);
    });
  }

  async clear(prefix?: string): Promise<void> {
    return this.withLock(async () => {
      if (!prefix) {
        await this.save(newCacheFile());
        return;
      }
      const file = await this.load();
      for (const k of Object.keys(file.entries)) {
        if (k.startsWith(prefix)) delete file.entries[k];
      }
      await this.save(file);
    });
  }
}
