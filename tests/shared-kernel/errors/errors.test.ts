import { describe, it, expect } from 'vitest';
import { ApplicationError } from '@/shared-kernel/errors/ApplicationError';
import { DomainError } from '@/shared-kernel/errors/DomainError';
import { InfrastructureError } from '@/shared-kernel/errors/InfrastructureError';

class TestApplicationError extends ApplicationError {
  readonly code = 'TEST_APP';
}

class TestDomainError extends DomainError {
  readonly code = 'TEST_DOMAIN';
  readonly userMessage = 'Something went wrong.';
}

class TestInfraError extends InfrastructureError {
  readonly code = 'TEST_INFRA';
}

describe('ApplicationError', () => {
  it('is an Error with a code', () => {
    const e = new TestApplicationError('something failed');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('TEST_APP');
    expect(e.message).toBe('something failed');
  });
  it('preserves cause', () => {
    const cause = new Error('root');
    const e = new TestApplicationError('wrapped', cause);
    expect(e.cause).toBe(cause);
  });
});

describe('DomainError', () => {
  it('exposes code and userMessage', () => {
    const e = new TestDomainError();
    expect(e.code).toBe('TEST_DOMAIN');
    expect(e.userMessage).toBe('Something went wrong.');
    expect(e).toBeInstanceOf(Error);
  });
  it('preserves cause', () => {
    const cause = new Error('root');
    const e = new TestDomainError('wrapped', cause);
    expect(e.cause).toBe(cause);
  });
});

describe('InfrastructureError', () => {
  it('has code', () => {
    expect(new TestInfraError('x').code).toBe('TEST_INFRA');
  });
});
