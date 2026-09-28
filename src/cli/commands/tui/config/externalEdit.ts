import { readFileSync } from 'node:fs';
import { loadConfig } from '@/shared-kernel/config/loader.js';

export interface ConfigCheck {
  ok: boolean;
  error?: string;
}

/**
 * The TUI no longer launches $EDITOR: spawning processes would give the
 * package shell access. Users edit the file themselves; this re-validates it.
 */
export function validateConfigFile(configPath: string): ConfigCheck {
  try {
    const content = readFileSync(configPath, 'utf8');
    loadConfig({ fileContent: content, env: process.env as Record<string, string>, cliOverrides: {} });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
