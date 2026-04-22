import { SecretValue } from './SecretValue.js';

export type AccessTokenKind = 'bearer' | 'cookie';

export class AccessToken {
  constructor(
    readonly kind: AccessTokenKind,
    private readonly secret: SecretValue,
  ) {}
  static bearer(raw: string): AccessToken {
    return new AccessToken('bearer', new SecretValue(raw));
  }
  static cookie(raw: string): AccessToken {
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
}
