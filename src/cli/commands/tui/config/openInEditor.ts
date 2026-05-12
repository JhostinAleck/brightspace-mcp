import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { loadConfig } from '@/shared-kernel/config/loader.js';

export interface EditorResult {
  ok: boolean;
  error?: string;
}

export function openInEditor(configPath: string): EditorResult {
  const editor = process.env['EDITOR'] ?? process.env['VISUAL'] ?? 'nano';
  const result = spawnSync(editor, [configPath], { stdio: 'inherit' });
  if (result.error) return { ok: false, error: result.error.message };

  try {
    const content = readFileSync(configPath, 'utf8');
    loadConfig({ fileContent: content, env: process.env as Record<string, string>, cliOverrides: {} });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
