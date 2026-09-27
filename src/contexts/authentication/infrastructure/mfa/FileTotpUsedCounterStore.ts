import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TotpUsedCounterStore } from './TotpMfaStrategy.js';

/**
 * Last submitted TOTP time-step, persisted so separate processes (server,
 * TUI, scripts) don't reuse a code. Holds only a counter — never the secret
 * or the code. Best-effort: I/O errors degrade to "no record".
 */
export class FileTotpUsedCounterStore implements TotpUsedCounterStore {
  constructor(private readonly path: string) {}

  async last(): Promise<number | null> {
    try {
      const { counter } = JSON.parse(readFileSync(this.path, 'utf8')) as { counter?: unknown };
      return typeof counter === 'number' ? counter : null;
    } catch {
      return null;
    }
  }

  async markUsed(counter: number): Promise<void> {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify({ counter }), { mode: 0o600 });
    } catch {
      /* best-effort */
    }
  }
}
