import { isNewerVersion } from '@/shared-kernel/updates/UpdateChecker.js';
import { readPackageVersion } from '@/shared-kernel/updates/packageVersion.js';

export { isNewerVersion };

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(5000);
    const res = await fetch('https://registry.npmjs.org/brightspace-mcp/latest', { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

export async function runUpgrade(): Promise<void> {
  const current = readPackageVersion();
  process.stdout.write(`Checking latest version of brightspace-mcp...\n`);

  const latest = await fetchLatestVersion();
  if (!latest) {
    process.stderr.write(`Could not reach npm registry. Check your internet connection.\n`);
    process.exit(1);
  }

  if (!isNewerVersion(latest, current)) {
    process.stdout.write(`✓ Already on the latest version (v${current}).\n`);
    return;
  }

  process.stdout.write(`Upgrading v${current} → v${latest}...\n\n`);

  const argv1 = process.argv[1] ?? '';
  const isGlobal =
    process.env['npm_config_global'] === 'true' ||
    argv1.includes('node_modules/.bin') ||
    argv1.includes('/bin/brightspace-mcp');

  if (isGlobal) {
    const { execSync } = await import('node:child_process');
    try {
      execSync('npm install -g brightspace-mcp@latest', { stdio: 'inherit' });
      process.stdout.write(`\n✓ Upgraded to v${latest}\n`);
    } catch {
      process.stderr.write(`npm install failed. Try manually: npm install -g brightspace-mcp@latest\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write(
      `Not installed globally. Choose your update method:\n\n` +
      `  npx (auto):    npx brightspace-mcp@latest [command]\n` +
      `  Global:        npm install -g brightspace-mcp@latest\n` +
      `  From source:   git pull && npm install && npm run build\n`,
    );
  }
}
