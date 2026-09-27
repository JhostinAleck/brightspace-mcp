import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools, type ToolDeps } from './registry.js';
import { registerAllResources } from './resources/registry.js';
import { registerAllPrompts } from './prompts/registry.js';
import { withUpdateNotice } from './update-notice.js';

export interface StartServerOptions extends ToolDeps {
  name?: string;
  version?: string;
  /** Returns a notice to append once to a tool response (e.g. "update available"). */
  updateNotice?: () => string | null;
}

export async function startServer(opts: StartServerOptions): Promise<McpServer> {
  const server = new McpServer({
    name: opts.name ?? 'brightspace',
    version: opts.version ?? '0.1.0',
  });
  if (opts.updateNotice) withUpdateNotice(server, opts.updateNotice);
  registerAllTools(server, opts);
  registerAllResources(server, opts);
  registerAllPrompts(server, opts);
  await server.connect(new StdioServerTransport());
  return server;
}
