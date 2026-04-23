import { describe, it, expect } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '@/contexts/http-api/resilience/CircuitBreaker.js';

class Clock {
  constructor(public now = 0) {}
  advance(ms: number) { this.now += ms; }
  read = () => this.now;
}

describe('CircuitBreaker', () => {
  it('stays closed while failures are below threshold', async () => {
    const clock = new Clock();
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1_000, now: clock.read });
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(breaker.run(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('opens after threshold consecutive failures and rejects fast', async () => {
    const clock = new Clock();
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1_000, now: clock.read });
    for (let i = 0; i < 2; i++) {
      await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    }
    expect(breaker.state).toBe('open');
    await expect(breaker.run(async () => 'ok')).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('transitions to half-open after resetTimeoutMs and closes on success', async () => {
    const clock = new Clock();
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 500, now: clock.read });
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(breaker.state).toBe('open');
    clock.advance(501);
    const value = await breaker.run(async () => 'ok');
    expect(value).toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('reopens on failure during half-open probe', async () => {
    const clock = new Clock();
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 500, now: clock.read });
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    clock.advance(501);
    await expect(breaker.run(async () => { throw new Error('still bad'); })).rejects.toThrow('still bad');
    expect(breaker.state).toBe('open');
  });

  it('success in closed state resets the failure counter', async () => {
    const clock = new Clock();
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1_000, now: clock.read });
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow();
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow();
    await breaker.run(async () => 'ok');
    // 2 failures then a success — another 2 failures shouldn't open because counter reset
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow();
    await expect(breaker.run(async () => { throw new Error('x'); })).rejects.toThrow();
    expect(breaker.state).toBe('closed');
  });
});
