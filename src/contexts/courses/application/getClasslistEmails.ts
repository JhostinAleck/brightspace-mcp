import type { CourseRepository } from '../domain/CourseRepository.js';
import type { CourseId } from '../domain/CourseId.js';

export interface GetClasslistEmailsInput {
  repo: CourseRepository;
  courseId: CourseId;
}

export async function getClasslistEmails(input: GetClasslistEmailsInput): Promise<string[]> {
  return input.repo.findClasslistEmails(input.courseId);
}
