import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  checkAuthSchema,
  listMyCoursesSchema,
  clearCacheSchema,
  getDiagnosticsSchema,
  getMyGradesSchema,
  getAssignmentsSchema,
  getUpcomingDueDatesSchema,
  getFeedbackSchema,
} from './schemas.js';
import { handleCheckAuth, type CheckAuthDeps } from './tools/check-auth.tool.js';
import { handleListMyCourses, type ListMyCoursesDeps } from './tools/list-my-courses.tool.js';
import { handleClearCache, type ClearCacheDeps } from './tools/clear-cache.tool.js';
import { handleGetDiagnostics, type GetDiagnosticsDeps } from './tools/get-diagnostics.tool.js';
import { handleGetMyGrades, type GetMyGradesDeps } from './tools/get-my-grades.tool.js';
import { handleGetAssignments, type GetAssignmentsDeps } from './tools/get-assignments.tool.js';
import { handleGetUpcomingDueDates, type GetUpcomingDueDatesDeps } from './tools/get-upcoming-due-dates.tool.js';
import { handleGetFeedback, type GetFeedbackDeps } from './tools/get-feedback.tool.js';

export interface ToolDeps
  extends CheckAuthDeps,
    ListMyCoursesDeps,
    ClearCacheDeps,
    GetDiagnosticsDeps,
    GetMyGradesDeps,
    GetAssignmentsDeps,
    GetUpcomingDueDatesDeps,
    GetFeedbackDeps {}

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

  server.registerTool(
    'get_my_grades',
    {
      title: 'Get My Grades',
      description:
        'Return grades for a specific course by numeric course id.\n' +
        'Use when the user asks about their grade, score, or standing in a class.\n' +
        'Defaults to compact format; pass format="detailed" for points breakdown.',
      inputSchema: getMyGradesSchema.shape,
    },
    async (input: unknown) => handleGetMyGrades(deps, input),
  );

  server.registerTool(
    'get_assignments',
    {
      title: 'Get Assignments',
      description:
        'List assignments (Brightspace Dropbox Folders) for a course.\n' +
        'Use when the user asks what they need to turn in or for a specific class.\n' +
        'Defaults to upcoming only; pass include_past=true to see everything.',
      inputSchema: getAssignmentsSchema.shape,
    },
    async (input: unknown) => handleGetAssignments(deps, input),
  );

  server.registerTool(
    'get_upcoming_due_dates',
    {
      title: 'Get Upcoming Due Dates',
      description:
        'Return assignments with due dates across all active courses within the next N days (default 14).\n' +
        'Use when the user asks "what is due" or wants a cross-course overview.',
      inputSchema: getUpcomingDueDatesSchema.shape,
    },
    async (input: unknown) => handleGetUpcomingDueDates(deps, input),
  );

  server.registerTool(
    'get_feedback',
    {
      title: 'Get Feedback',
      description:
        'Return the instructor feedback for a single assignment in a given course.\n' +
        'Use when the user asks about comments, score, or grading on a specific submission.',
      inputSchema: getFeedbackSchema.shape,
    },
    async (input: unknown) => handleGetFeedback(deps, input),
  );
}
