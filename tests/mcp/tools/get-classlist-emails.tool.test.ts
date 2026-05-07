import { describe, it, expect } from 'vitest';
import { handleGetClasslistEmails } from '@/mcp/tools/get-classlist-emails.tool';
import { FakeCourseRepository } from '@tests/helpers/fakes/FakeCourseRepository';
import { Classmate } from '@/contexts/courses/domain/Classmate';
import { UserId } from '@/shared-kernel/types/UserId';

describe('get_classlist_emails tool', () => {
  it('returns only emails as a comma-separated list', async () => {
    const repo = new FakeCourseRepository([], new Map([[101, [
      new Classmate({ userId: UserId.of(1), displayName: 'Alice', uniqueName: 'alice', email: 'alice@x.edu', role: 'student' }),
      new Classmate({ userId: UserId.of(2), displayName: 'Bob', uniqueName: 'bob', email: null, role: 'student' }),
    ]]]));
    const r = await handleGetClasslistEmails({ courseRepo: repo }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('alice@x.edu');
    expect(r.content[0]?.text).not.toContain('null');
  });
});
