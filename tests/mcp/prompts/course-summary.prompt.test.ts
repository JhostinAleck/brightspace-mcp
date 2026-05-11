/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCourseSummaryPrompt } from '@/mcp/prompts/course-summary.prompt.js';
import { testOutputContext } from '../../helpers/test-output-context.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';

function makeServer() { return new McpServer({ name: 'test', version: '0.0.0' }); }
const mockCourse = { id: CourseId.of(55), name: 'Programación I', code: 'ISIS-1221', active: true };

describe('course_summary prompt', () => {
  it('resolves course name in the message', async () => {
    const courseRepo = { findById: vi.fn().mockResolvedValue(mockCourse) } as any;
    const server = makeServer();
    registerCourseSummaryPrompt(server, { courseRepo, output: testOutputContext({ locale: 'en-US' }) });
    const registered = (server as any)._registeredPrompts?.['course_summary'];
    const result = await registered.callback({ course_id: 55 }, {});
    expect(result.messages[0].content.text).toContain('Programación I');
    expect(result.messages[0].content.text).toContain('55');
    expect(result.messages[0].content.text).toContain('get_syllabus');
  });

  it('falls back to id when course not found', async () => {
    const courseRepo = { findById: vi.fn().mockResolvedValue(null) } as any;
    const server = makeServer();
    registerCourseSummaryPrompt(server, { courseRepo, output: testOutputContext({ locale: 'en-US' }) });
    const registered = (server as any)._registeredPrompts?.['course_summary'];
    const result = await registered.callback({ course_id: 999 }, {});
    expect(result.messages[0].content.text).toContain('999');
  });
});
