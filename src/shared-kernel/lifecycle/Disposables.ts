export interface Disposable {
  dispose(): Promise<void>;
}

/**
 * Tracks resources that need to be released on graceful shutdown:
 *   - ioredis client `quit()`
 *   - Playwright browser `close()`
 *   - file locks etc.
 *
 * Disposers run in LIFO order. A failure in one disposer is logged via the
 * provided sink but does not stop subsequent disposers from running.
 */
export class Disposables {
  private readonly disposers: Array<() => Promise<void>> = [];

  add(fn: () => Promise<void>): void {
    this.disposers.push(fn);
  }

  size(): number {
    return this.disposers.length;
  }

  async disposeAll(onError?: (err: unknown) => void): Promise<void> {
    while (this.disposers.length > 0) {
      const fn = this.disposers.pop();
      if (!fn) break;
      try {
        await fn();
      } catch (err) {
        onError?.(err);
      }
    }
  }
}
