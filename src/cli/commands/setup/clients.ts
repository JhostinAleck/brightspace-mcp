import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DetectedClient {
  name: 'claude-desktop' | 'cursor' | 'windsurf';
  configPath: string;
}

export interface DetectOptions {
  home: string;
  platform: NodeJS.Platform;
}

export function detectMcpClients(opts: DetectOptions): DetectedClient[] {
  const paths: Array<{ name: DetectedClient['name']; path: string }> = [];

  const claudePath =
    opts.platform === 'darwin'
      ? join(opts.home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : opts.platform === 'win32'
        ? join(opts.home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
        : join(opts.home, '.config', 'Claude', 'claude_desktop_config.json');
  paths.push({ name: 'claude-desktop', path: claudePath });

  paths.push({ name: 'cursor', path: join(opts.home, '.cursor', 'mcp.json') });
  paths.push({
    name: 'windsurf',
    path: join(opts.home, '.codeium', 'windsurf', 'mcp_config.json'),
  });

  return paths
    .filter((p) => existsSync(p.path))
    .map((p) => ({ name: p.name, configPath: p.path }));
}

export interface RegisterOptions {
  clientName: DetectedClient['name'];
  home: string;
  platform: NodeJS.Platform;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export function registerWithClient(opts: RegisterOptions): void {
  const detected = detectMcpClients({ home: opts.home, platform: opts.platform });
  const target = detected.find((c) => c.name === opts.clientName);
  if (!target) {
    throw new Error(`${opts.clientName} config not found`);
  }

  const raw = readFileSync(target.configPath, 'utf8');
  const json = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
  json.mcpServers ??= {};
  json.mcpServers.brightspace = {
    command: opts.command,
    args: opts.args,
    ...(opts.env ? { env: opts.env } : {}),
  };
  writeFileSync(target.configPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}
