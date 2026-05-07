import { InfrastructureError } from '@/shared-kernel/errors/InfrastructureError.js';

export class CircuitOpenError extends InfrastructureError {
  readonly code = 'CIRCUIT_OPEN';
  constructor(message = 'Circuit breaker is open') { super(message); }
}

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  now?: () => number;
  onStateChange?: (state: CircuitState) => void;
}

export class CircuitBreaker {
  private _state: CircuitState = 'closed';
  private failureCount = 0;
  private openedAt = 0;
  private readonly now: () => number;
  private readonly onStateChange?: (state: CircuitState) => void;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.now = opts.now ?? Date.now;
    if (opts.onStateChange) this.onStateChange = opts.onStateChange;
  }

  get state(): CircuitState { return this._state; }

  private setState(next: CircuitState): void {
    if (this._state === next) return;
    this._state = next;
    this.onStateChange?.(next);
  }

  async run<T>(op: () => Promise<T>): Promise<T> {
    if (this._state === 'open') {
      if (this.now() - this.openedAt < this.opts.resetTimeoutMs) {
        throw new CircuitOpenError();
      }
      this.setState('half_open');
    }

    try {
      const value = await op();
      this.failureCount = 0;
      this.setState('closed');
      return value;
    } catch (err) {
      if (this._state === 'half_open') {
        this.openedAt = this.now();
        this.setState('open');
        throw err;
      }
      this.failureCount += 1;
      if (this.failureCount >= this.opts.failureThreshold) {
        this.openedAt = this.now();
        this.setState('open');
      }
      throw err;
    }
  }
}
