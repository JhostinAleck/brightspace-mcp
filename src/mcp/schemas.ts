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
