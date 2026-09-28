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

  // Printed, not executed: running npm from here would give the package
  // shell access, and the right command depends on how it was installed.
  process.stdout.write(
    `New version available: v${current} → v${latest}\n\n` +
    `  Global install:  npm install -g brightspace-mcp@latest\n` +
    `  npx:             npx brightspace-mcp@latest [command]  (MCP configs from setup already use @latest)\n` +
    `  From source:     git pull && npm install && npm run build\n`,
  );
}
