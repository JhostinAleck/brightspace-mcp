export type TransportMode = 'strict' | 'allow_http_for_localhost';

const LOCALHOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export class TransportPolicy {
  private constructor(private readonly mode: TransportMode) {}

  static strict(): TransportPolicy {
    return new TransportPolicy('strict');
  }

  static allowHttpForLocalhost(): TransportPolicy {
    return new TransportPolicy('allow_http_for_localhost');
  }

  validate(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`TransportPolicy: invalid URL "${url}"`);
    }
    if (parsed.protocol === 'https:') return;
    if (parsed.protocol !== 'http:') {
      throw new Error(`TransportPolicy: unsupported scheme "${parsed.protocol}" in "${url}"`);
    }
    if (this.mode === 'allow_http_for_localhost' && LOCALHOSTS.has(parsed.hostname)) return;
    throw new Error(
      `TransportPolicy: HTTPS is required for "${url}" (mode=${this.mode})`,
    );
  }

  get describe(): TransportMode { return this.mode; }
}
