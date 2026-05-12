export type { TuiDeps } from './tui/types.js';
import type { TuiDeps } from './tui/types.js';

export async function runTui(deps: TuiDeps): Promise<void> {
  const { render } = await import('ink');
  const React = await import('react');
  const { App } = await import('./tui/App.js');
  const instance = render(React.createElement(App, { deps }));
  await instance.waitUntilExit();
}
