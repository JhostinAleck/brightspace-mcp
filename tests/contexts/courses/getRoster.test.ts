import { describe, it, expect } from 'vitest';
import { getRoster } from '@/contexts/courses/getRoster';
import { Classmate } from '@/contexts/courses/Classmate';
import { UserId } from '@/shared-kernel/types/UserId';
import { CourseId } from '@/contexts/courses/CourseId';
import { FakeCourseRepository } from '@tests/helpers/fakes/FakeCourseRepository';

const mate = (userIdNum: number, name: string, role: Classmate['role']) =>
  new Classmate({
    userId: UserId.of(userIdNum),
    displayName: name,
    uniqueName: `${name.toLowerCase()}@x`,
    email: `${name.toLowerCase()}@x.com`,
    role,
  });

describe('getRoster', () => {
  it('returns the roster for a course', async () => {
    const repo = new FakeCourseRepository([], new Map([[101, [mate(1, 'Alice', 'student'), mate(2, 'Bob', 'instructor')]]]));
    const out = await getRoster({ repo, courseId: CourseId.of(101) });
    expect(out).toHaveLength(2);
  });

  it('returns empty array when course has no roster', async () => {
    const repo = new FakeCourseRepository([]);
    const out = await getRoster({ repo, courseId: CourseId.of(101) });
    expect(out).toEqual([]);
  });
});
