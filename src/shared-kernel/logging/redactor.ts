/**
 * Best-effort secret redaction for structured log lines.
 *
 * This is defense-in-depth — NOT a substitute for never logging raw secrets.
 * Callers must still avoid passing bearer tokens, cookies, TOTP secrets, or
 * other credential material through the logger. The patterns here catch the
 * most common leak shapes and tolerate some false positives because the
 * cost of leaking a secret is much higher than redacting an innocent string.
 */
const PATTERNS: Array<[RegExp, string]> = [
  // Base32 TOTP-shaped secrets (16-128 uppercase A-Z / digits 2-7).
  // Capped at 128 chars to avoid pathological backtracking on long random
  // ASCII strings. Real TOTP secrets are 16-32 chars in practice.
  [/\b[A-Z2-7]{16,128}\b/g, '[REDACTED]'],

  // JWT (header.payload.signature) — three base64url segments separated by
  // dots. The header almost always starts with `eyJ` (`{"`).
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]'],

  // HTTP header-style Bearer token (case-insensitive).
  // Char class includes base64 standard alphabet: /, +, =.
  [/Bearer\s+[A-Za-z0-9._/+=-]+/gi, 'Bearer [REDACTED]'],

  // HTTP header-style Cookie / Set-Cookie line (case-insensitive).
  [/(?:Set-)?Cookie:\s*[^\r\n]+/gi, 'Cookie: [REDACTED]'],

  // JSON-serialized header fields (Cookie / Authorization / Set-Cookie).
  // Catches the common shape {"Cookie":"sessionid=abc"} that the header-line
  // pattern above misses because the colon-quote separator is non-standard.
  [/"(?:Cookie|Set-Cookie|Authorization)"\s*:\s*"[^"]*"/gi, '"Cookie":"[REDACTED]"'],

  // Credentials embedded in URLs: https://user:password@host
  [/([a-z][a-z0-9+\-.]*:\/\/[^:/?#\s]+):[^@/?#\s]+@/gi, '$1:[REDACTED]@'],
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}
