import { homedir } from 'node:os';

/**
 * Expand `~/` (Unix) and `%VAR%` (Windows) tokens to absolute path strings.
 * Cross-platform — `~` is also handled on Windows where it would otherwise
 * be a literal character.
 */
export function expandPath(rawPath: string): string {
  // Unix: ~/... → /home/user/...
  let p = rawPath.startsWith('~') ? rawPath.replace(/^~/, homedir()) : rawPath;
  // Windows: %USERPROFILE%\... or any %VAR% token
  p = p.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`);
  return p;
}
