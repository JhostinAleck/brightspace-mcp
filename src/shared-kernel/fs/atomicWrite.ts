import { writeFile, rename as fsRename, chmod, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

type RenameFn = (from: string, to: string) => Promise<void>;

export interface AtomicWriteOptions {
  /** File mode (0o600 etc). Ignored on Windows. */
  mode?: number;
  /** Override the rename impl (testing only). */
  renameFn?: RenameFn;
  /** Retry attempts on EPERM/EBUSY/EACCES. Default 10. */
  attempts?: number;
  /** Base delay in ms between retries (exponential). Default 5. */
  baseDelayMs?: number;
}

/**
 * Rename a file with retry on transient Windows errors.
 *
 * Windows raises `EPERM` (and occasionally `EBUSY`/`EACCES`) when another
 * handle to the target file is still being released — antivirus scans,
 * tail-end fs caching, or concurrent test workers all trip this. The
 * conventional fix used by `write-file-atomic`, `npm`, etc. is to retry
 * with short exponential backoff because the handle clears within ms.
 *
 * Non-Windows transient errors are also retried — cheap, and lets the
 * helper double as protection against NFS hiccups.
 */
export async function renameWithRetry(
  from: string,
  to: string,
  opts: Pick<AtomicWriteOptions, 'attempts' | 'baseDelayMs' | 'renameFn'> = {},
): Promise<void> {
  const attempts = opts.attempts ?? 10;
  const baseDelay = opts.baseDelayMs ?? 5;
  const rn = opts.renameFn ?? fsRename;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await rn(from, to);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw err;
      if (i === attempts - 1) break;
      const delay = baseDelay * Math.pow(1.5, i);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

/**
 * Write a file atomically: stage to `<target>.tmp-<rand>`, chmod (POSIX),
 * then rename onto `target`. The rename is retried on transient Windows
 * errors via {@link renameWithRetry}.
 */
export async function atomicWrite(
  targetPath: string,
  data: string | Buffer,
  opts: AtomicWriteOptions = {},
): Promise<void> {
  const tmp = `${targetPath}.tmp-${randomBytes(4).toString('hex')}`;
  await writeFile(tmp, data);
  if (process.platform !== 'win32' && opts.mode !== undefined) {
    await chmod(tmp, opts.mode);
  }
  try {
    await renameWithRetry(tmp, targetPath, opts);
  } catch (err) {
    await unlink(tmp).catch(() => { /* best-effort */ });
    throw err;
  }
}
