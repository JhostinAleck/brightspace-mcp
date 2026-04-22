import { describe, it, expect } from 'vitest';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue';

describe('SecretValue', () => {
  it('exposes value via reveal()', () => {
    expect(new SecretValue('abc').reveal()).toBe('abc');
  });
  it('toString() returns [REDACTED]', () => {
    expect(String(new SecretValue('abc'))).toBe('[REDACTED]');
  });
  it('JSON.stringify returns [REDACTED]', () => {
    expect(JSON.stringify(new SecretValue('abc'))).toBe('"[REDACTED]"');
  });
});
