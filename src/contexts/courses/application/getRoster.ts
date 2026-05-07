import type { CourseRepository } from '../domain/CourseRepository.js';
import type { Classmate } from '../domain/Classmate.js';
import type { CourseId } from '../domain/CourseId.js';

export interface GetRosterInput {
  repo: CourseRepository;
  courseId: CourseId;
}

export async function getRoster(input: GetRosterInput): Promise<Classmate[]> {
  return input.repo.findRoster(input.courseId);
}
