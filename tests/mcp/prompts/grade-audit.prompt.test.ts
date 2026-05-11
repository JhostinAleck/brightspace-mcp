/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGradeAuditPrompt } from '@/mcp/prompts/grade-audit.prompt.js';
import { testOutputContext } from '../../helpers/test-output-context.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';

function makeServer() { return new McpServer({ name: 'test', version: '0.0.0' }); }
const mockCourse = { id: CourseId.of(101), name: 'Cálculo I', code: 'MATE-1101', active: true };

describe('grade_audit prompt', () => {
  it('returns all-courses message when no course_id', async () => {
    const courseRepo = { findById: vi.fn() } as any;
    const server = makeServer();
    registerGradeAuditPrompt(server, { courseRepo, output: testOutputContext({ locale: 'en-US' }) });
    const registered = (server as any)._registeredPrompts?.['grade_audit'];
    const result = await registered.callback({}, {});
    expect(result.messages[0].content.text).toContain('all courses');
    expect(courseRepo.findById).not.toHaveBeenCalled();
  });

  it('resolves course name when course_id provided', async () => {
    const courseRepo = { findById: vi.fn().mockResolvedValue(mockCourse) } as any;
    const server = makeServer();
    registerGradeAuditPrompt(server, { courseRepo, output: testOutputContext({ locale: 'en-US' }) });
    const registered = (server as any)._registeredPrompts?.['grade_audit'];
    const result = await registered.callback({ course_id: 101 }, {});
    expect(result.messages[0].content.text).toContain('Cálculo I');
    expect(result.messages[0].content.text).toContain('101');
  });

  it('falls back to id when course not found', async () => {
    const courseRepo = { findById: vi.fn().mockResolvedValue(null) } as any;
    const server = makeServer();
    registerGradeAuditPrompt(server, { courseRepo, output: testOutputContext({ locale: 'en-US' }) });
    const registered = (server as any)._registeredPrompts?.['grade_audit'];
    const result = await registered.callback({ course_id: 999 }, {});
    expect(result.messages[0].content.text).toContain('999');
  });
});
