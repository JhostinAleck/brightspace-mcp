import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export default function setup(): void {
  if (!existsSync('build/cli/main.js')) {
    execSync('npm run build', { stdio: 'inherit' });
  }
}
