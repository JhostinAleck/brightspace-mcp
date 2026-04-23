import { describe, expect, it } from 'vitest';

import { registerAllTools, type ToolDeps } from '@/mcp/registry.js';
import { WritesGate } from '@/shared-kernel/writes/WritesGate.js';

// Stub MCP server that records tool names registered against it.
// Matches the actual SDK shape used in this repo: server.registerTool(name, metadata, handler).
function mockServer(): { server: unknown; registered: string[] } {
  const registered: string[] = [];
  const server = {
    registerTool: (name: string, _metadata: unknown, _handler: unknown) => {
      registered.push(name);
      return undefined;
    },
  } as unknown;
  return { server, registered };
}

// Minimal stub for the non-writes ToolDeps fields. The gating test only exercises the
// top-level branching, so all fields other than writesGate are cast through unknown.
function baseDeps(gate: WritesGate): ToolDeps {
  return {
    writesGate: gate,
    idempotencyStore: {
      get: async () => null,
      put: async () => undefined,
    },
    auditLogger: {
      recordWriteAttempt: () => undefined,
    },
  } as unknown as ToolDeps;
}

describe('write tool gating', () => {
  it('does NOT register submit_assignment / post_discussion_reply / mark_announcement_read when gate closed', () => {
    const { server, registered } = mockServer();
    const gate = new WritesGate({ configEnabled: true, cliFlag: false });
    registerAllTools(server as never, baseDeps(gate));
    expect(registered).not.toContain('submit_assignment');
    expect(registered).not.toContain('post_discussion_reply');
    expect(registered).not.toContain('mark_announcement_read');
  });

  it('DOES register the 3 write tools when gate open', () => {
    const { server, registered } = mockServer();
    const gate = new WritesGate({ configEnabled: true, cliFlag: true });
    registerAllTools(server as never, baseDeps(gate));
    expect(registered).toContain('submit_assignment');
    expect(registered).toContain('post_discussion_reply');
    expect(registered).toContain('mark_announcement_read');
  });
});
