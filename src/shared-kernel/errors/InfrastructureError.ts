export abstract class InfrastructureError extends Error {
  abstract readonly code: string;
  override readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = new.target.name;
    if (cause) this.cause = cause;
  }
}
