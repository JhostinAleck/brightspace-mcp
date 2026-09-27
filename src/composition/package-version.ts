import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedPackageVersion: string | null = null;
export function readPackageVersion(): string {
  if (cachedPackageVersion) return cachedPackageVersion;
  // Compiled to build/composition/package-version.js → ../../package.json;
  // under vitest it runs from src/composition/ with the same depth.
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string };
    cachedPackageVersion = pkg.version ?? '0.0.0';
  } catch {
    cachedPackageVersion = '0.0.0';
  }
  return cachedPackageVersion;
}
