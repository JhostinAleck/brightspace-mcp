import type { Syllabus } from './Syllabus.js';
import type { Module } from './Module.js';
import type { CourseFilePath } from './CourseFilePath.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface ContentRepository {
  findSyllabus(courseId: OrgUnitId): Promise<Syllabus | null>;
  findModules(courseId: OrgUnitId): Promise<Module[]>;
  findTopicFile(courseId: OrgUnitId, topicId: number): Promise<Buffer>;
  findTopicRenderedText(courseId: OrgUnitId, topicId: number): Promise<string>;
  /** Raw bytes of a file in the course's own content area (/content/enforced/{ou}-…). */
  findCourseFile(courseId: OrgUnitId, path: CourseFilePath): Promise<Buffer>;
}
