export type { TuiDeps } from './tui/types.js';
import type { render as inkRender } from 'ink';
import type * as ReactNs from 'react';

import type { TuiDeps } from './tui/types.js';

/**
 * ink/react are optional dependencies: the MCP server never needs them, so
 * installs that skip optionals (`--omit=optional`) still work — only the TUI
 * is unavailable, with an actionable message instead of a module error.
 */
export async function loadTuiRuntime(
  importer: (name: string) => Promise<unknown> = (name) => import(name),
): Promise<{ render: typeof inkRender; React: typeof ReactNs }> {
  try {
    const [ink, React] = await Promise.all([importer('ink'), importer('react')]);
    return { render: (ink as { render: typeof inkRender }).render, React: React as typeof ReactNs };
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'the terminal dashboard needs the optional packages "ink" and "react", which are not installed. ' +
          'Reinstall without --omit=optional (e.g. `npm install -g brightspace-mcp`).',
        { cause: err },
      );
    }
    throw err;
  }
}

export async function runTui(deps: TuiDeps): Promise<void> {
  const { render, React } = await loadTuiRuntime();
  const { App } = await import('./tui/App.js');
  const instance = render(React.createElement(App, { deps }));
  try {
    await instance.waitUntilExit();
  } finally {
    await deps.disposables?.disposeAll();
  }
}
