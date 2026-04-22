import { describe, it, expect } from 'vitest';
import { SessionExpiredError, AuthConfigError } from '@/contexts/authentication/domain/errors.js';

describe('auth errors', () => {
  it('SessionExpiredError has code and userMessage', () => {
    const e = new SessionExpiredError();
    expect(e.code).toBe('AUTH_SESSION_EXPIRED');
    expect(e.userMessage).toMatch(/expired/i);
  });
  it('AuthConfigError has code', () => {
    expect(new AuthConfigError('bad').code).toBe('AUTH_CONFIG');
  });
});
