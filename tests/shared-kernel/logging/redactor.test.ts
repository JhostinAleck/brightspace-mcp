import { describe, it, expect } from 'vitest';
import { redactSecrets } from '@/shared-kernel/logging/redactor';

describe('redactSecrets', () => {
  it('redacts base32 TOTP-shaped secrets (16-32 chars A-Z,2-7)', () => {
    expect(redactSecrets('secret=JBSWY3DPEHPK3PXP')).toBe('secret=[REDACTED]');
  });
  it('redacts Bearer tokens', () => {
    expect(redactSecrets('Authorization: Bearer abc.def.ghi')).toContain('Bearer [REDACTED]');
  });
  it('redacts Cookie headers', () => {
    expect(redactSecrets('Cookie: session=xyz; other=val')).toContain('Cookie: [REDACTED]');
  });
  it('leaves regular text alone', () => {
    expect(redactSecrets('just some text')).toBe('just some text');
  });

  it('redacts Bearer tokens with base64 chars /, +, =', () => {
    expect(redactSecrets('Bearer A/B+C==')).toBe('Bearer [REDACTED]');
  });

  it('redacts lowercase bearer prefix', () => {
    expect(redactSecrets('authorization: bearer abc.def.ghi')).toContain('Bearer [REDACTED]');
  });

  it('redacts Set-Cookie headers', () => {
    expect(redactSecrets('Set-Cookie: session=xyz; Path=/')).toContain('Cookie: [REDACTED]');
  });

  it('redacts JSON-serialized Cookie field', () => {
    const input = JSON.stringify({ Cookie: 'sessionid=abc' });
    expect(redactSecrets(input)).toBe('{"Cookie":"[REDACTED]"}');
  });

  it('redacts JSON-serialized Authorization field', () => {
    const input = JSON.stringify({ Authorization: 'Bearer tok_abc' });
    // Either the JSON pattern or the Bearer pattern should catch it.
    expect(redactSecrets(input)).not.toContain('tok_abc');
  });

  it('redacts long base32 runs (>32 chars)', () => {
    const long = 'A'.repeat(40); // 40 uppercase A's — classic bypass case
    expect(redactSecrets(`secret=${long}`)).toBe('secret=[REDACTED]');
  });

  it('redacts multiple secrets in one line', () => {
    const out = redactSecrets('Cookie: x=1\nBearer tok.en');
    expect(out).toContain('Cookie: [REDACTED]');
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('redacts JWTs (eyJ... format)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(redactSecrets(`Authorization: Bearer ${jwt}`)).toContain('Bearer [REDACTED]');
  });

  it('redacts secrets embedded in URLs', () => {
    const out = redactSecrets('https://user:s3cr3t_pass@school.brightspace.com/api');
    expect(out).not.toContain('s3cr3t_pass');
  });
});
