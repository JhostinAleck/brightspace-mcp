export class SecretValue {
  constructor(private readonly value: string) {}
  reveal(): string {
    return this.value;
  }
  toString(): string {
    return '[REDACTED]';
  }
  toJSON(): string {
    return '[REDACTED]';
  }
}
