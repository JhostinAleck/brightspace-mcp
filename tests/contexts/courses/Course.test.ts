import { describe, it, expect } from 'vitest';
import { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';

describe('Course', () => {
  it('builds with required fields', () => {
    const c = new Course({ id: CourseId.of(123), name: 'ECE 264', code: 'ECE26400', active: true });
    expect(c.name).toBe('ECE 264');
    expect(CourseId.toNumber(c.id)).toBe(123);
  });
});
