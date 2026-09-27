import { describe, it, expect } from 'vitest';
import { withUpdateNotice } from '@/mcp/update-notice.js';

type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function fakeServer() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<Result>>();
  return {
    handlers,
    registerTool(name: string, _config: unknown, cb: (...args: unknown[]) => Promise<Result>) {
      handlers.set(name, cb);
      return {};
    },
  };
}

describe('withUpdateNotice', () => {
  it('appends the notice to the first successful tool response only', async () => {
    const server = fakeServer();
    withUpdateNotice(server as never, () => 'UPDATE AVAILABLE');
    server.registerTool('a', {}, async () => ({ content: [{ type: 'text', text: 'hello' }] }));
    const a = server.handlers.get('a')!;
    expect((await a()).content.map((c) => c.text)).toEqual(['hello', 'UPDATE AVAILABLE']);
    expect((await a()).content.map((c) => c.text)).toEqual(['hello']);
  });

  it('waits until a notice exists before consuming the one-time slot', async () => {
    const server = fakeServer();
    let notice: string | null = null;
    withUpdateNotice(server as never, () => notice);
    server.registerTool('a', {}, async () => ({ content: [{ type: 'text', text: 'x' }] }));
    const a = server.handlers.get('a')!;
    expect((await a()).content).toHaveLength(1);
    notice = 'NOW';
    expect((await a()).content.at(-1)?.text).toBe('NOW');
  });

  it('does not attach the notice to error results', async () => {
    const server = fakeServer();
    withUpdateNotice(server as never, () => 'N');
    server.registerTool('e', {}, async () => ({ content: [{ type: 'text', text: 'boom' }], isError: true }));
    server.registerTool('ok', {}, async () => ({ content: [{ type: 'text', text: 'fine' }] }));
    expect((await server.handlers.get('e')!()).content).toHaveLength(1);
    expect((await server.handlers.get('ok')!()).content.at(-1)?.text).toBe('N');
  });
});
