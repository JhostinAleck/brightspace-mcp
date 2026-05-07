import { describe, expect, it } from 'vitest';
import { CircuitBreaker, type CircuitState } from '@/contexts/http-api/resilience/CircuitBreaker.js';

class Clock {
  constructor(public now = 0) {}
  advance(ms: number) { this.now += ms; }
  read = () => this.now;
}

describe('CircuitBreaker.onStateChange', () => {
  it('fires once per real transition, not on every run', async () => {
    const clock = new Clock();
    const transitions: CircuitState[] = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 100,
      now: clock.read,
      onStateChange: (s) => transitions.push(s),
    });

    // 2 failures while already open should not re-fire onStateChange.
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow();
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow();
    expect(transitions).toEqual(['open']);

    // After resetTimeoutMs, a successful probe runs through half_open → closed.
    clock.advance(150);
    await breaker.run(async () => 'ok');
    expect(transitions).toEqual(['open', 'half_open', 'closed']);
  });

  it('does not fire on initial closed state (no spurious "closed" event at boot)', async () => {
    const transitions: CircuitState[] = [];
    new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1_000,
      onStateChange: (s) => transitions.push(s),
    });
    // No state change yet — observers should not be notified for the
    // implicit starting position.
    expect(transitions).toEqual([]);
  });
});
