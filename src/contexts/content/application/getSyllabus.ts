import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetSyllabusInput {
  repo: ContentRepository;
  courseId: OrgUnitId;
}

export function getSyllabus(input: GetSyllabusInput): Promise<Syllabus | null> {
  return input.repo.findSyllabus(input.courseId);
}
