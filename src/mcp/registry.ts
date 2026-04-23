import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  checkAuthSchema,
  listMyCoursesSchema,
  clearCacheSchema,
  getDiagnosticsSchema,
} from './schemas.js';
import { handleCheckAuth, type CheckAuthDeps } from './tools/check-auth.tool.js';
import { handleListMyCourses, type ListMyCoursesDeps } from './tools/list-my-courses.tool.js';
import { handleClearCache, type ClearCacheDeps } from './tools/clear-cache.tool.js';
import { handleGetDiagnostics, type GetDiagnosticsDeps } from './tools/get-diagnostics.tool.js';

export interface ToolDeps
  extends CheckAuthDeps,
    ListMyCoursesDeps,
    ClearCacheDeps,
    GetDiagnosticsDeps {}

export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'check_auth',
    {
      title: 'Check Authentication Status',
      description:
        'Verify whether the server can talk to Brightspace on your behalf.\n' +
        'Use when the user asks if they are logged in, or when other tools return auth errors.',
      inputSchema: checkAuthSchema.shape,
    },
    async () => handleCheckAuth(deps),
  );

  server.registerTool(
    'list_my_courses',
    {
      title: 'List My Courses',
      description:
        'List enrolled courses.\n' +
        'Use when the user asks about their classes, semester, or what they are taking.\n' +
        'Defaults to active courses only.',
      inputSchema: listMyCoursesSchema.shape,
    },
    async (input: unknown) => handleListMyCourses(deps, input),
  );

  server.registerTool(
    'clear_cache',
    {
      title: 'Clear Cache',
      description:
        'Clear cached responses. Use when the user asks to refresh data, or when tools return stale values.\n' +
        'Scope: "all" (default), "http", or "courses".',
      inputSchema: clearCacheSchema.shape,
    },
    async (input: unknown) => handleClearCache(deps, input),
  );

  server.registerTool(
    'get_diagnostics',
    {
      title: 'Get Diagnostics',
      description:
        'Return a JSON report of server state: profile, base URL, discovered D2L versions, cache hit/miss counters, and HTTP request timing stats.\n' +
        'Use when the user reports slowness or the LLM detects stale data.',
      inputSchema: getDiagnosticsSchema.shape,
    },
    async (input: unknown) => handleGetDiagnostics(deps, input),
  );
}
