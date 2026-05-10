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
  getAssignmentFilesSchema,
  getTopicFileSchema,
  getAuditLogSchema,
  listQuizzesSchema,
  getQuizAttemptsSchema,
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
import { handleGetAssignmentFiles, type GetAssignmentFilesDeps } from './tools/get-assignment-files.tool.js';
import { handleGetTopicFile, type GetTopicFileDeps } from './tools/get-topic-file.tool.js';
import { handleGetAuditLog, type GetAuditLogDeps } from './tools/get-audit-log.tool.js';
import { handleListQuizzes, type ListQuizzesDeps } from './tools/list-quizzes.tool.js';
import { handleGetQuizAttempts, type GetQuizAttemptsDeps } from './tools/get-quiz-attempts.tool.js';
import { handleGetMyGroups, getMyGroupsSchema, type GetMyGroupsDeps } from './tools/get-my-groups.tool.js';
import { handleSearchCourse, searchCourseSchema, type SearchCourseDeps } from './tools/search-course.tool.js';
import { handleListNotifications, listNotificationsSchema, type ListNotificationsDeps } from './tools/list-notifications.tool.js';
import {
  handleSubmitAssignment,
  submitAssignmentSchema,
  type SubmitAssignmentParams,
} from './tools/submit-assignment.tool.js';
import {
  handlePostDiscussionReply,
  postDiscussionReplySchema,
  type PostDiscussionReplyParams,
} from './tools/post-discussion-reply.tool.js';
import {
  handleMarkAnnouncementRead,
  markAnnouncementReadSchema,
  type MarkAnnouncementReadParams,
} from './tools/mark-announcement-read.tool.js';
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
    GetCalendarEventsDeps,
    GetAssignmentFilesDeps,
    GetTopicFileDeps,
    GetAuditLogDeps,
    ListQuizzesDeps,
    GetQuizAttemptsDeps,
    GetMyGroupsDeps,
    SearchCourseDeps,
    ListNotificationsDeps {
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

  server.registerTool(
    'get_assignment_files',
    {
      title: 'Get Assignment Files',
      description:
        'Download and read the attachments (instructions, templates) posted on a Brightspace assignment.\n' +
        'Returns the text content of DOCX files and file info for other formats.\n' +
        'Pass save_to with a folder path (~/..., %VAR%\\..., or absolute) to also save each binary to disk.\n' +
        'Use when the user asks "what do I have to do", "download the assignment", or "read the instructions".',
      inputSchema: getAssignmentFilesSchema.shape,
    },
    async (input: unknown) => handleGetAssignmentFiles(deps, input),
  );

  server.registerTool(
    'get_topic_file',
    {
      title: 'Get Topic File',
      description:
        'Download and read a content topic file from a Brightspace course.\n' +
        'Use get_course_content first to find the topic id (shown as id=XXXX next to each topic).\n' +
        'Use when the user wants to read a specific file posted in the course content (PDFs, DOCX, XLSX, etc.).\n' +
        'Pass save_to with an absolute or ~/... path to also save the raw file to disk (e.g. ~/Downloads/file.xlsx).',
      inputSchema: getTopicFileSchema.shape,
    },
    async (input: unknown) => handleGetTopicFile(deps, input),
  );

  server.registerTool(
    'list_quizzes',
    {
      title: 'List Quizzes',
      description:
        'List quizzes for a course with attempt counts, time limits, and close dates.\n' +
        'Read-only — no quiz answers or questions are exposed (intentionally).\n' +
        'Use when the user asks "what quizzes do I have", "what\'s due in X class", or about attempt history.',
      inputSchema: listQuizzesSchema.shape,
    },
    async (input: unknown) => handleListQuizzes(deps, input),
  );

  server.registerTool(
    'get_quiz_attempts',
    {
      title: 'Get Quiz Attempts',
      description:
        'List your attempts on a single quiz with scores and submission status.\n' +
        'Use when the user asks "what did I get on the X quiz" or "have I started Y yet".',
      inputSchema: getQuizAttemptsSchema.shape,
    },
    async (input: unknown) => handleGetQuizAttempts(deps, input),
  );

  server.registerTool(
    'list_notifications',
    {
      title: 'List Notifications',
      description:
        'Show your Brightspace activity feed (announcements, due-date reminders, grade releases, etc.).\n' +
        'Pass unread_only=true to filter. Defaults to last 25 notifications.',
      inputSchema: listNotificationsSchema.shape,
    },
    async (input: unknown) => handleListNotifications(deps, input),
  );

  server.registerTool(
    'search_course',
    {
      title: 'Search Course',
      description:
        'Full-text search across course content, announcements, and discussion forums.\n' +
        'Returns ranked snippets. Use when the user asks "where did the prof mention X" or "is there anything about Y in this class".',
      inputSchema: searchCourseSchema.shape,
    },
    async (input: unknown) => handleSearchCourse(deps, input),
  );

  server.registerTool(
    'get_my_groups',
    {
      title: 'Get My Groups',
      description:
        'List the groups you are enrolled in for a course (with member names).\n' +
        'Useful for group projects: "who\'s in my group?" or finding the right grpid for a submission.',
      inputSchema: getMyGroupsSchema.shape,
    },
    async (input: unknown) => handleGetMyGroups(deps, input),
  );

  server.registerTool(
    'get_audit_log',
    {
      title: 'Get Audit Log',
      description:
        'Return the local audit history of write attempts (submit_assignment, post_discussion_reply, mark_announcement_read).\n' +
        'Read-only — no writes-gate required. Optionally filter by tool name and/or `since` ISO timestamp.\n' +
        'Use when the user asks "what did I submit today" or for compliance review.',
      inputSchema: getAuditLogSchema.shape,
    },
    async (input: unknown) => handleGetAuditLog(deps, input),
  );

  if (deps.writesGate.allowsWrites) {
    // Stub write tools — real handlers land in Tasks 10-12. For now, register 3 placeholder
    // tools so the gate visibly governs what the MCP surface exposes.
    server.registerTool(
      'submit_assignment',
      {
        title: 'Submit Assignment',
        description:
          'Upload a file to a Brightspace Dropbox Folder. Pass either `file_path` (recommended for files >1 MB — read server-side, saves tokens) or `content_base64`. ' +
          'Writes: require --enable-writes + config writes.enabled: true.',
        inputSchema: submitAssignmentSchema.shape,
      },
      async (args) => handleSubmitAssignment(args as SubmitAssignmentParams, deps),
    );

    server.registerTool(
      'post_discussion_reply',
      {
        title: 'Post Discussion Reply',
        description:
          'Reply to a Brightspace discussion topic. Writes: require --enable-writes + config writes.enabled: true.',
        inputSchema: postDiscussionReplySchema.shape,
      },
      async (args) => handlePostDiscussionReply(args as PostDiscussionReplyParams, deps),
    );

    server.registerTool(
      'mark_announcement_read',
      {
        title: 'Mark Announcement Read',
        description: 'Mark a Brightspace announcement as read. Writes: require --enable-writes + config writes.enabled: true.',
        inputSchema: markAnnouncementReadSchema.shape,
      },
      async (args) => handleMarkAnnouncementRead(args as MarkAnnouncementReadParams, deps),
    );
  }
}
