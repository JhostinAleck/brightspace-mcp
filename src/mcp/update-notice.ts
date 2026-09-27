import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };
type ToolCallback = (...args: unknown[]) => Promise<ToolResult> | ToolResult;

/**
 * Appends an update notice to the first successful tool response of the
 * session. MCP clients hide the server's stderr, so putting the notice in a
 * tool result is the only way the model (and thus the user) actually sees it.
 * Must be installed before tools are registered.
 */
export function withUpdateNotice(server: McpServer, getNotice: () => string | null): void {
  const register = server.registerTool.bind(server) as (name: string, config: unknown, cb: ToolCallback) => unknown;
  let shown = false;
  const patched = (name: string, config: unknown, cb: ToolCallback) =>
    register(name, config, async (...args: unknown[]) => {
      const result = await cb(...args);
      if (shown || result.isError) return result;
      const notice = getNotice();
      if (!notice) return result;
      shown = true;
      return { ...result, content: [...result.content, { type: 'text', text: notice }] };
    });
  server.registerTool = patched as unknown as McpServer['registerTool'];
}
