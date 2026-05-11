import { describe, expect, it } from 'vitest';
import {
  buildSyllabusUri,
  buildAnnouncementUri,
  buildContentTopicUri,
  buildAssignmentFilesUri,
  parseUri,
} from '@/mcp/resources/uri-builder.js';

describe('uri-builder', () => {
  it('buildSyllabusUri', () => {
    expect(buildSyllabusUri(123)).toBe('brightspace://123/syllabus');
  });
  it('buildAnnouncementUri', () => {
    expect(buildAnnouncementUri(123, '456')).toBe('brightspace://123/announcements/456');
  });
  it('buildContentTopicUri', () => {
    expect(buildContentTopicUri(123, 789)).toBe('brightspace://123/content/topics/789');
  });
  it('buildAssignmentFilesUri', () => {
    expect(buildAssignmentFilesUri(123, 10)).toBe('brightspace://123/assignments/10/files');
  });
  it('parseUri syllabus', () => {
    expect(parseUri('brightspace://123/syllabus')).toEqual({ type: 'syllabus', courseId: 123 });
  });
  it('parseUri announcement', () => {
    expect(parseUri('brightspace://123/announcements/456')).toEqual({
      type: 'announcement',
      courseId: 123,
      announcementId: '456',
    });
  });
  it('parseUri content-topic', () => {
    expect(parseUri('brightspace://123/content/topics/789')).toEqual({
      type: 'content-topic',
      courseId: 123,
      topicId: 789,
    });
  });
  it('parseUri assignment-files', () => {
    expect(parseUri('brightspace://123/assignments/10/files')).toEqual({
      type: 'assignment-files',
      courseId: 123,
      assignmentId: 10,
    });
  });
  it('parseUri returns null for bad scheme', () => {
    expect(parseUri('https://example.com')).toBeNull();
    expect(parseUri('brightspace://abc/syllabus')).toBeNull();
    expect(parseUri('brightspace://123/unknown')).toBeNull();
    expect(parseUri('')).toBeNull();
  });
  it('round-trips: build then parse', () => {
    expect(parseUri(buildSyllabusUri(42))).toEqual({ type: 'syllabus', courseId: 42 });
    expect(parseUri(buildContentTopicUri(1, 2))).toEqual({
      type: 'content-topic',
      courseId: 1,
      topicId: 2,
    });
  });
});
