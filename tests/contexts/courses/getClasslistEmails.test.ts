import { describe, it, expect } from 'vitest';
import { getClasslistEmails } from '@/contexts/courses/application/getClasslistEmails';
import { Classmate } from '@/contexts/courses/domain/Classmate';
import { UserId } from '@/shared-kernel/types/UserId';
import { CourseId } from '@/contexts/courses/domain/CourseId';
import { FakeCourseRepository } from '@tests/helpers/fakes/FakeCourseRepository';

describe('getClasslistEmails', () => {
  it('returns only emails', async () => {
    const alice = new Classmate({
      userId: UserId.of(1),
      displayName: 'Alice',
      uniqueName: 'alice',
      email: 'alice@x.com',
      role: 'student',
    });
    const bob = new Classmate({
      userId: UserId.of(2),
      displayName: 'Bob',
      uniqueName: 'bob',
      email: null,
      role: 'student',
    });
    const repo = new FakeCourseRepository([], new Map([[101, [alice, bob]]]));
    const out = await getClasslistEmails({ repo, courseId: CourseId.of(101) });
    expect(out).toEqual(['alice@x.com']);
  });
});
