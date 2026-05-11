import { describe, expect, it } from 'vitest';
import { detectSystemTz, isValidTz } from '@/shared-kernel/output/time/tz-detector.js';

describe('tz-detector', () => {
  it('detects system tz via Intl', () => {
    expect(typeof detectSystemTz()).toBe('string');
    expect(detectSystemTz().length).toBeGreaterThan(0);
  });

  it('isValidTz accepts canonical IANA names', () => {
    expect(isValidTz('America/Bogota')).toBe(true);
    expect(isValidTz('UTC')).toBe(true);
    expect(isValidTz('Europe/Madrid')).toBe(true);
  });

  it('isValidTz rejects garbage', () => {
    expect(isValidTz('Mars/Olympus')).toBe(false);
    expect(isValidTz('')).toBe(false);
  });
});
