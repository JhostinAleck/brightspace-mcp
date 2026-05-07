import { describe, it, expect } from 'vitest';
import { handleGetRoster } from '@/mcp/tools/get-roster.tool';
import { FakeCourseRepository } from '@tests/helpers/fakes/FakeCourseRepository';
import { Classmate } from '@/contexts/courses/domain/Classmate';
import { UserId } from '@/shared-kernel/types/UserId';

const mate = (id: number, name: string, role: Classmate['role']) =>
  new Classmate({
    userId: UserId.of(id),
    displayName: name,
    uniqueName: name.toLowerCase(),
    email: `${name.toLowerCase()}@x`,
    role,
  });

describe('get_roster tool', () => {
  it('returns the full roster by default', async () => {
    const repo = new FakeCourseRepository([], new Map([[101, [mate(1, 'Alice', 'student'), mate(2, 'Bob', 'instructor')]]]));
    const r = await handleGetRoster({ courseRepo: repo }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('Alice');
    expect(r.content[0]?.text).toContain('Bob');
  });

  it('filters by role when role_filter is set', async () => {
    const repo = new FakeCourseRepository([], new Map([[101, [mate(1, 'Alice', 'student'), mate(2, 'Bob', 'instructor')]]]));
    const r = await handleGetRoster({ courseRepo: repo }, { course_id: 101, role_filter: 'instructor' });
    expect(r.content[0]?.text).toContain('Bob');
    expect(r.content[0]?.text).not.toContain('Alice');
  });
});
