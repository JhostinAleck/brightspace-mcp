import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetCourseContentInput {
  repo: ContentRepository;
  courseId: OrgUnitId;
}

export function getCourseContent(input: GetCourseContentInput): Promise<Module[]> {
  return input.repo.findModules(input.courseId);
}
