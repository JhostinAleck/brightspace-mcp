import type { CourseRepository } from './CourseRepository.js';
import type { CourseId } from './CourseId.js';

export interface GetClasslistEmailsInput {
  repo: CourseRepository;
  courseId: CourseId;
}

export async function getClasslistEmails(input: GetClasslistEmailsInput): Promise<string[]> {
  return input.repo.findClasslistEmails(input.courseId);
}
