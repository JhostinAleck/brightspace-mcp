import { DomainError } from '@/shared-kernel/errors/DomainError.js';

export class SessionExpiredError extends DomainError {
  readonly code = 'AUTH_SESSION_EXPIRED';
  readonly userMessage = 'Your session expired. Re-authenticating...';
}

export class AuthConfigError extends DomainError {
  readonly code = 'AUTH_CONFIG';
  constructor(
    readonly userMessage: string,
    cause?: Error,
  ) {
    super(userMessage, cause);
  }
}

export class AuthStrategyFailedError extends DomainError {
  readonly code = 'AUTH_STRATEGY_FAILED';
  constructor(
    readonly userMessage: string,
    cause?: Error,
  ) {
    super(userMessage, cause);
  }
}
