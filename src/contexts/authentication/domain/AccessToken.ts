import { SecretValue } from './SecretValue.js';

export type AccessTokenKind = 'bearer' | 'cookie';

export interface AccessTokenJson {
  readonly kind: AccessTokenKind;
  readonly secret: string;
}

const HEADER_INVALID = /[\r\n\0]/;

function rejectHeaderInjection(label: string, raw: string): void {
  if (HEADER_INVALID.test(raw)) {
    // CRLF in a header value enables HTTP request smuggling. undici rejects
    // these at fetch time, but we want a domain-level error rather than
    // surface-level "Invalid header" from the runtime.
    throw new Error(`Invalid ${label} value: contains CR, LF, or NUL`);
  }
}

export class AccessToken {
  constructor(
    readonly kind: AccessTokenKind,
    private readonly secret: SecretValue,
  ) {}
  static bearer(raw: string): AccessToken {
    rejectHeaderInjection('bearer token', raw);
    return new AccessToken('bearer', new SecretValue(raw));
  }
  static cookie(raw: string): AccessToken {
    rejectHeaderInjection('cookie', raw);
    return new AccessToken('cookie', new SecretValue(raw));
  }
  reveal(): string {
    return this.secret.reveal();
  }
  toAuthHeader(): { name: string; value: string } {
    return this.kind === 'bearer'
      ? { name: 'Authorization', value: `Bearer ${this.secret.reveal()}` }
      : { name: 'Cookie', value: this.secret.reveal() };
  }
  toPersistable(): AccessTokenJson {
    return { kind: this.kind, secret: this.secret.reveal() };
  }
  static fromPersistable(json: AccessTokenJson): AccessToken {
    rejectHeaderInjection(`${json.kind} token`, json.secret);
    return new AccessToken(json.kind, new SecretValue(json.secret));
  }
}
