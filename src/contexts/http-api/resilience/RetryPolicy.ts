export interface RetryDecision {
  readonly retry: boolean;
  readonly retryAfterMs?: number;
}

export type RetryClassifier = (error: unknown, attempt: number) => RetryDecision;

export interface RetryPolicyOptions {
  maxAttempts: number;
  initialMs: number;
  maxMs: number;
  classifier: RetryClassifier;
  jitter?: (baseMs: number) => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultJitter = (base: number): number => base + Math.random() * base * 0.3;
const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class RetryPolicy {
  private readonly jitter: (baseMs: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: RetryPolicyOptions) {
    this.jitter = opts.jitter ?? defaultJitter;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async run<T>(op: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
      try {
        return await op();
      } catch (err) {
        lastError = err;
        const decision = this.opts.classifier(err, attempt);
        if (!decision.retry || attempt === this.opts.maxAttempts) break;
        const base = Math.min(this.opts.initialMs * 2 ** (attempt - 1), this.opts.maxMs);
        // When the server provides Retry-After we honour it verbatim — even if
        // it exceeds maxMs. The server's instruction wins because rate-limit
        // windows are usually longer than our exponential backoff cap.
        const wait = decision.retryAfterMs !== undefined
          ? Math.max(0, decision.retryAfterMs)
          : Math.min(this.jitter(base), this.opts.maxMs);
        await this.sleep(wait);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
