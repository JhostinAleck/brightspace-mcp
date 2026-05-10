import { describe, expect, it } from 'vitest';

import {
  AuthExpiredError,
  D2lApiError,
  WritesDisabledByTenantError,
  classifyD2lError,
} from '@/contexts/http-api/errors.js';

describe('classifyD2lError', () => {
  it('maps 401 to AuthExpiredError regardless of path', () => {
    const result = classifyD2lError(new D2lApiError(401, '/d2l/api/lp/1.59/users/whoami', 'Unauthorized'));
    expect(result).toBeInstanceOf(AuthExpiredError);
    expect((result as AuthExpiredError).code).toBe('AUTH_EXPIRED');
    expect((result as AuthExpiredError).hint).toContain('record-auth');
  });

  it('maps 403 with xsrf body to AuthExpiredError', () => {
    const result = classifyD2lError(
      new D2lApiError(403, '/d2l/api/le/1.93/100/dropbox/folders/42/submissions/mysubmissions/', 'XSRF token mismatch'),
    );
    expect(result).toBeInstanceOf(AuthExpiredError);
  });

  it('maps 403 on dropbox path with non-xsrf body to WritesDisabledByTenantError', () => {
    const result = classifyD2lError(
      new D2lApiError(403, '/d2l/api/le/1.93/100/dropbox/folders/42/submissions/mysubmissions/', '{"Errors":[{"Message":"Forbidden"}]}'),
    );
    expect(result).toBeInstanceOf(WritesDisabledByTenantError);
    expect((result as WritesDisabledByTenantError).code).toBe('WRITES_DISABLED_BY_TENANT');
  });

  it('maps 403 on forums/posts to WritesDisabledByTenantError', () => {
    const result = classifyD2lError(
      new D2lApiError(403, '/d2l/api/le/1.93/100/forums/3/topics/4/posts/', '{"Errors":[{"Message":"Forbidden"}]}'),
    );
    expect(result).toBeInstanceOf(WritesDisabledByTenantError);
  });

  it('leaves unrelated 403 (e.g. read endpoints) as plain D2lApiError', () => {
    const result = classifyD2lError(
      new D2lApiError(403, '/d2l/api/lp/1.59/courses/100', 'Forbidden'),
    );
    expect(result).toBeInstanceOf(D2lApiError);
    expect(result).not.toBeInstanceOf(AuthExpiredError);
    expect(result).not.toBeInstanceOf(WritesDisabledByTenantError);
  });

  it('leaves 5xx as plain D2lApiError', () => {
    const result = classifyD2lError(new D2lApiError(500, '/anywhere', 'oops'));
    expect(result).toBeInstanceOf(D2lApiError);
    expect(result).not.toBeInstanceOf(AuthExpiredError);
  });
});
