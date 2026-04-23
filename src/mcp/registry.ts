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
  getRosterSchema,
  getClasslistEmailsSchema,
  getSyllabusSchema,
  getCourseContentSchema,
  getAnnouncementsSchema,
  getDiscussionsSchema,
  getCalendarEventsSchema,
} from './schemas.js';
import { handleCheckAuth, type CheckAuthDeps } from './tools/check-auth.tool.js';
import { handleListMyCourses, type ListMyCoursesDeps } from './tools/list-my-courses.tool.js';
import { handleClearCache, type ClearCacheDeps } from './tools/clear-cache.tool.js';
import { handleGetDiagnostics, type GetDiagnosticsDeps } from './tools/get-diagnostics.tool.js';
import { handleGetMyGrades, type GetMyGradesDeps } from './tools/get-my-grades.tool.js';
import { handleGetAssignments, type GetAssignmentsDeps } from './tools/get-assignments.tool.js';
import { handleGetUpcomingDueDates, type GetUpcomingDueDatesDeps } from './tools/get-upcoming-due-dates.tool.js';
import { handleGetFeedback, type GetFeedbackDeps } from './tools/get-feedback.tool.js';
import { handleGetRoster, type GetRosterDeps } from './tools/get-roster.tool.js';
import { handleGetClasslistEmails, type GetClasslistEmailsDeps } from './tools/get-classlist-emails.tool.js';
import { handleGetSyllabus, type GetSyllabusDeps } from './tools/get-syllabus.tool.js';
import { handleGetCourseContent, type GetCourseContentDeps } from './tools/get-course-content.tool.js';
import { handleGetAnnouncements, type GetAnnouncementsDeps } from './tools/get-announcements.tool.js';
import { handleGetDiscussions, type GetDiscussionsDeps } from './tools/get-discussions.tool.js';
import { handleGetCalendarEvents, type GetCalendarEventsDeps } from './tools/get-calendar-events.tool.js';
import {
  handleSubmitAssignment,
  submitAssignmentSchema,
  type SubmitAssignmentParams,
} from './tools/submit-assignment.tool.js';
import type { WritesGate } from '@/shared-kernel/writes/WritesGate.js';
import type { IdempotencyStore } from '@/shared-kernel/idempotency/IdempotencyStore.js';
import type { AuditLogger } from '@/shared-kernel/audit/AuditLogger.js';

export interface ToolDeps
  extends CheckAuthDeps,
    ListMyCoursesDeps,
    ClearCacheDeps,
    GetDiagnosticsDeps,
    GetMyGradesDeps,
    GetAssignmentsDeps,
    GetUpcomingDueDatesDeps,
    GetFeedbackDeps,
    GetRosterDeps,
    GetClasslistEmailsDeps,
    GetSyllabusDeps,
    GetCourseContentDeps,
    GetAnnouncementsDeps,
    GetDiscussionsDeps,
    GetCalendarEventsDeps {
  writesGate: WritesGate;
  idempotencyStore: IdempotencyStore;
  auditLogger: AuditLogger;
}

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

  server.registerTool(
    'get_roster',
    {
      title: 'Get Roster',
      description:
        'List classmates, instructors, and TAs for a given course.\n' +
        'Use when the user asks who is in a class or wants contact info.\n' +
        'role_filter: "all" (default), "student", "instructor", "ta".',
      inputSchema: getRosterSchema.shape,
    },
    async (input: unknown) => handleGetRoster(deps, input),
  );

  server.registerTool(
    'get_classlist_emails',
    {
      title: 'Get Classlist Emails',
      description:
        'Return the email addresses for everyone enrolled in a course.\n' +
        'Use when the user wants a mailing list or to contact the class.',
      inputSchema: getClasslistEmailsSchema.shape,
    },
    async (input: unknown) => handleGetClasslistEmails(deps, input),
  );

  server.registerTool(
    'get_syllabus',
    {
      title: 'Get Syllabus',
      description:
        'Return the course syllabus (overview page) as plain text.\n' +
        'Use when the user wants to know course expectations, grading scheme, or what the class covers.',
      inputSchema: getSyllabusSchema.shape,
    },
    async (input: unknown) => handleGetSyllabus(deps, input),
  );

  server.registerTool(
    'get_course_content',
    {
      title: 'Get Course Content',
      description:
        'Return the course module tree with topics (files, quizzes, discussions, etc.).\n' +
        'Use when the user asks what materials are posted or wants to navigate modules.',
      inputSchema: getCourseContentSchema.shape,
    },
    async (input: unknown) => handleGetCourseContent(deps, input),
  );

  server.registerTool(
    'get_announcements',
    {
      title: 'Get Announcements',
      description:
        'Return recent course announcements in reverse chronological order.\n' +
        'Use when the user asks "what did the professor post" or wants recent news from a class.',
      inputSchema: getAnnouncementsSchema.shape,
    },
    async (input: unknown) => handleGetAnnouncements(deps, input),
  );

  server.registerTool(
    'get_discussions',
    {
      title: 'Get Discussions',
      description:
        'Return the list of discussion forums and topics for a course, with post counts and last-post timestamps.\n' +
        'Use when the user asks about class discussions or wants to see what conversations are happening.',
      inputSchema: getDiscussionsSchema.shape,
    },
    async (input: unknown) => handleGetDiscussions(deps, input),
  );

  server.registerTool(
    'get_calendar_events',
    {
      title: 'Get Calendar Events',
      description:
        'Return course calendar events within the next N days (default 30). Useful for seeing exams, lectures, or instructor-scheduled events.\n' +
        'Use when the user asks about scheduled events, exam dates, or class meetings.',
      inputSchema: getCalendarEventsSchema.shape,
    },
    async (input: unknown) => handleGetCalendarEvents(deps, input),
  );

  if (deps.writesGate.allowsWrites) {
    // Stub write tools — real handlers land in Tasks 10-12. For now, register 3 placeholder
    // tools so the gate visibly governs what the MCP surface exposes.
    server.registerTool(
      'submit_assignment',
      {
        title: 'Submit Assignment',
        description:
          'Upload a file to a Brightspace Dropbox Folder. Writes: require --enable-writes + config writes.enabled: true.',
        inputSchema: submitAssignmentSchema.shape,
      },
      async (args) => handleSubmitAssignment(args as SubmitAssignmentParams, deps),
    );

    server.registerTool(
      'post_discussion_reply',
      {
        title: 'Post Discussion Reply',
        description: 'Post a reply to a discussion topic (writes).',
        inputSchema: {},
      },
      async () => ({ content: [{ type: 'text', text: 'stub' }] }),
    );

    server.registerTool(
      'mark_announcement_read',
      {
        title: 'Mark Announcement Read',
        description: 'Mark an announcement as read (writes).',
        inputSchema: {},
      },
      async () => ({ content: [{ type: 'text', text: 'stub' }] }),
    );
  }
}
