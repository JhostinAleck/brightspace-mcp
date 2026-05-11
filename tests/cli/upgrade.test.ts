import { describe, expect, it } from 'vitest';
import { isNewerVersion } from '@/cli/commands/upgrade.js';

describe('isNewerVersion', () => {
  it('returns true when remote is newer major', () => {
    expect(isNewerVersion('2.0.0', '1.5.0')).toBe(true);
  });

  it('returns true when remote is newer minor', () => {
    expect(isNewerVersion('1.2.0', '1.1.3')).toBe(true);
  });

  it('returns true when remote is newer patch', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
  });

  it('returns false when same version', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });

  it('returns false when local is newer', () => {
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(false);
  });
});
