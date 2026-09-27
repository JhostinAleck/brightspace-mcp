import { describe, expect, it } from 'vitest';

import { CourseFilePath, InvalidCourseFilePathError } from '@/contexts/content/domain/CourseFilePath.js';

const OU = 486307;
const ORIGIN = 'https://school.example.edu';

describe('CourseFilePath.parse', () => {
  it('accepts a /content/enforced path that belongs to the course', () => {
    const p = CourseFilePath.parse('/content/enforced/486307-202620_ISIS3510_5/Slides/C1.pdf', OU);
    expect(p.path).toBe('/content/enforced/486307-202620_ISIS3510_5/Slides/C1.pdf');
    expect(p.filename).toBe('C1.pdf');
  });

  it('percent-encodes raw spaces and keeps existing encoding stable', () => {
    expect(CourseFilePath.parse('/content/enforced/486307-X/Sprint 1/Activity description.pdf', OU).path)
      .toBe('/content/enforced/486307-X/Sprint%201/Activity%20description.pdf');
    expect(CourseFilePath.parse('/content/enforced/486307-X/Capi%CC%81tulo%201.pdf', OU).path)
      .toBe('/content/enforced/486307-X/Capi%CC%81tulo%201.pdf');
  });

  it('decodes the filename for display', () => {
    expect(CourseFilePath.parse('/content/enforced/486307-X/Programa%20Curso.pdf', OU).filename).toBe('Programa Curso.pdf');
  });

  it('drops the query string (session tokens, isCourseFile=true) and fragment', () => {
    expect(CourseFilePath.parse('/content/enforced/486307-X/a.pdf?isCourseFile=true&d2lSessionVal=abc#p2', OU).path)
      .toBe('/content/enforced/486307-X/a.pdf');
  });

  it('accepts an absolute URL on the tenant origin', () => {
    const p = CourseFilePath.parse(`${ORIGIN}/content/enforced/486307-X/s.pdf?isCourseFile=true`, OU, { origin: `${ORIGIN}/` });
    expect(p.path).toBe('/content/enforced/486307-X/s.pdf');
  });

  it.each([
    ['another host', 'https://evil.example.com/content/enforced/486307-X/s.pdf', { origin: ORIGIN }],
    ['absolute URL with unknown tenant origin', `${ORIGIN}/content/enforced/486307-X/s.pdf`, {}],
    ['non-http scheme', 'file:///etc/passwd', { origin: ORIGIN }],
    ['protocol-relative URL', '//evil.example.com/content/enforced/486307-X/s.pdf', { origin: ORIGIN }],
  ])('rejects %s', (_label, raw, opts) => {
    expect(() => CourseFilePath.parse(raw, OU, opts)).toThrow(InvalidCourseFilePathError);
  });

  it.each([
    ['outside /content/enforced', '/d2l/api/lp/1.63/users/whoami'],
    ['another course', '/content/enforced/486308-X/s.pdf'],
    ['a course id that only shares a prefix', '/content/enforced/4863070-X/s.pdf'],
    ['path traversal', '/content/enforced/486307-X/../486308-Y/s.pdf'],
    ['encoded traversal', '/content/enforced/486307-X/%2e%2e/%2e%2e/d2l/s.pdf'],
    ['encoded slash', '/content/enforced/486307-X/a%2F..%2F..%2Fb.pdf'],
    ['backslashes', '/content/enforced/486307-X\\..\\s.pdf'],
    ['a bare directory', '/content/enforced/486307-X/'],
    ['empty input', '   '],
    ['a relative path', 'files/s.pdf'],
  ])('rejects %s', (_label, raw) => {
    expect(() => CourseFilePath.parse(raw, OU)).toThrow(InvalidCourseFilePathError);
  });

  it('isRelative tells relative references apart', () => {
    expect(CourseFilePath.isRelative('files/Lab1.pdf')).toBe(true);
    expect(CourseFilePath.isRelative('../Lab1.pdf')).toBe(true);
    expect(CourseFilePath.isRelative('/content/enforced/1-X/a.pdf')).toBe(false);
    expect(CourseFilePath.isRelative('https://x/a.pdf')).toBe(false);
  });
});
