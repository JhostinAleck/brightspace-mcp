import { mkdir, rm, stat, utimes } from 'node:fs/promises';

export interface FileLockOptions {
  /** Attempts after the first one before giving up (default 10). */
  retries?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
  /** A lock untouched for this long is considered abandoned (default 10 s). */
  staleMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function isStale(lockDir: string, staleMs: number): Promise<boolean> {
  try {
    return Date.now() - (await stat(lockDir)).mtimeMs > staleMs;
  } catch {
    return false; // Released between our mkdir and stat: just retry.
  }
}

/**
 * Cross-process mutex around `op`, using an atomic `mkdir` of `<path>.lock`
 * — the same protocol as proper-lockfile, so processes running older
 * versions still exclude each other. The holder refreshes the lock's mtime
 * so long operations are not mistaken for crashed holders.
 */
export async function withFileLock<T>(path: string, op: () => Promise<T>, opts: FileLockOptions = {}): Promise<T> {
  const { retries = 10, minTimeoutMs = 20, maxTimeoutMs = 200, staleMs = 10_000 } = opts;
  const lockDir = `${path}.lock`;
  for (let attempt = 0; ; attempt++) {
    try {
      await mkdir(lockDir);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (await isStale(lockDir, staleMs)) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      if (attempt >= retries) {
        throw Object.assign(new Error(`Lock file is already being held: ${lockDir}`), { code: 'ELOCKED' });
      }
      await sleep(Math.min(maxTimeoutMs, minTimeoutMs * 1.2 ** attempt));
    }
  }
  const refresh = setInterval(() => {
    const now = new Date();
    utimes(lockDir, now, now).catch(() => undefined);
  }, Math.max(1000, staleMs / 2));
  refresh.unref();
  try {
    return await op();
  } finally {
    clearInterval(refresh);
    await rm(lockDir, { recursive: true, force: true });
  }
}
