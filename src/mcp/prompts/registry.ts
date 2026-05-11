import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface PromptDeps {
  courseRepo: unknown;
  output: unknown;
}

// Prompts registered in Tasks 9-12
export function registerAllPrompts(_server: McpServer, _deps: unknown): void {}
