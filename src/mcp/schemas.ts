import { z } from 'zod';

export const checkAuthSchema = z.object({}).strict();

export const listMyCoursesSchema = z
  .object({
    active_only: z.boolean().default(true),
    format: z.enum(['compact', 'detailed']).default('compact'),
    limit: z.number().int().positive().max(200).default(50),
  })
  .strict();

export type ListMyCoursesInput = z.infer<typeof listMyCoursesSchema>;

export const clearCacheSchema = z.object({
  scope: z.enum(['all', 'http', 'courses']).default('all'),
}).strict();

export type ClearCacheInput = z.infer<typeof clearCacheSchema>;

export const getDiagnosticsSchema = z.object({}).strict();

export const getMyGradesSchema = z.object({
  course_id: z.number().int().positive(),
  format: z.enum(['compact', 'detailed']).default('compact'),
}).strict();

export type GetMyGradesInput = z.infer<typeof getMyGradesSchema>;

export const getFeedbackSchema = z.object({
  course_id: z.number().int().positive(),
  assignment_id: z.number().int().positive(),
}).strict();

export type GetFeedbackInputSchema = z.infer<typeof getFeedbackSchema>;

export const getAssignmentsSchema = z.object({
  course_id: z.number().int().positive(),
  include_past: z.boolean().default(false),
  format: z.enum(['compact', 'detailed']).default('compact'),
}).strict();

export type GetAssignmentsInputSchema = z.infer<typeof getAssignmentsSchema>;

export const getUpcomingDueDatesSchema = z.object({
  days: z.number().int().positive().max(365).default(14),
  format: z.enum(['compact', 'detailed']).default('compact'),
}).strict();

export type GetUpcomingDueDatesInputSchema = z.infer<typeof getUpcomingDueDatesSchema>;

export const getRosterSchema = z.object({
  course_id: z.number().int().positive(),
  role_filter: z.enum(['all', 'student', 'instructor', 'ta']).default('all'),
}).strict();

export type GetRosterInputSchema = z.infer<typeof getRosterSchema>;

export const getClasslistEmailsSchema = z.object({
  course_id: z.number().int().positive(),
}).strict();

export type GetClasslistEmailsInputSchema = z.infer<typeof getClasslistEmailsSchema>;

export const getSyllabusSchema = z.object({
  course_id: z.number().int().positive(),
}).strict();
export type GetSyllabusInputSchema = z.infer<typeof getSyllabusSchema>;

export const getCourseContentSchema = z.object({
  course_id: z.number().int().positive(),
  depth: z.number().int().nonnegative().max(5).default(2),
}).strict();
export type GetCourseContentInputSchema = z.infer<typeof getCourseContentSchema>;

export const getAnnouncementsSchema = z.object({
  course_id: z.number().int().positive(),
  limit: z.number().int().positive().max(50).default(10),
}).strict();
export type GetAnnouncementsInputSchema = z.infer<typeof getAnnouncementsSchema>;

export const getDiscussionsSchema = z.object({
  course_id: z.number().int().positive(),
}).strict();
export type GetDiscussionsInputSchema = z.infer<typeof getDiscussionsSchema>;

export const getCalendarEventsSchema = z.object({
  course_id: z.number().int().positive(),
  days: z.number().int().positive().max(365).default(30),
}).strict();
export type GetCalendarEventsInputSchema = z.infer<typeof getCalendarEventsSchema>;

export const getAssignmentFilesSchema = z.object({
  course_id: z.number().int().positive(),
  assignment_id: z.number().int().positive(),
}).strict();
export type GetAssignmentFilesInputSchema = z.infer<typeof getAssignmentFilesSchema>;

export const getTopicFileSchema = z.object({
  course_id: z.number().int().positive(),
  topic_id: z.number().int().positive(),
}).strict();
export type GetTopicFileInputSchema = z.infer<typeof getTopicFileSchema>;
