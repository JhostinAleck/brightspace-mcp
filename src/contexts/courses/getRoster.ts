import type { CourseRepository } from './CourseRepository.js';
import type { Classmate } from './Classmate.js';
import type { CourseId } from './CourseId.js';

export interface GetRosterInput {
  repo: CourseRepository;
  courseId: CourseId;
}

export async function getRoster(input: GetRosterInput): Promise<Classmate[]> {
  return input.repo.findRoster(input.courseId);
}
