import { describe, it, expect } from 'vitest';
import { TransportPolicy } from '@/contexts/http-api/transport/TransportPolicy.js';

describe('TransportPolicy', () => {
  it('strict policy rejects http:// URLs', () => {
    const policy = TransportPolicy.strict();
    expect(() => policy.validate('http://example.com')).toThrow(/https/i);
  });

  it('strict policy accepts https:// URLs', () => {
    const policy = TransportPolicy.strict();
    expect(() => policy.validate('https://example.com')).not.toThrow();
  });

  it('allowHttpForLocalhost accepts http://127.0.0.1 and localhost', () => {
    const policy = TransportPolicy.allowHttpForLocalhost();
    expect(() => policy.validate('http://127.0.0.1:1234')).not.toThrow();
    expect(() => policy.validate('http://localhost:5000')).not.toThrow();
    expect(() => policy.validate('https://example.com')).not.toThrow();
  });

  it('allowHttpForLocalhost still rejects http:// for non-local hosts', () => {
    const policy = TransportPolicy.allowHttpForLocalhost();
    expect(() => policy.validate('http://production.example.com')).toThrow(/https/i);
  });

  it('rejects non-http schemes', () => {
    const strict = TransportPolicy.strict();
    expect(() => strict.validate('ftp://example.com')).toThrow();
  });
});
