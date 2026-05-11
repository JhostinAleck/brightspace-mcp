export function buildSyllabusUri(courseId: number): string {
  return `brightspace://${courseId}/syllabus`;
}

export function buildAnnouncementUri(courseId: number, announcementId: string): string {
  return `brightspace://${courseId}/announcements/${announcementId}`;
}

export function buildContentTopicUri(courseId: number, topicId: number): string {
  return `brightspace://${courseId}/content/topics/${topicId}`;
}

export function buildAssignmentFilesUri(courseId: number, assignmentId: number): string {
  return `brightspace://${courseId}/assignments/${assignmentId}/files`;
}

export type ParsedSyllabusUri = { type: 'syllabus'; courseId: number };
export type ParsedAnnouncementUri = {
  type: 'announcement';
  courseId: number;
  announcementId: string;
};
export type ParsedContentTopicUri = { type: 'content-topic'; courseId: number; topicId: number };
export type ParsedAssignmentFilesUri = {
  type: 'assignment-files';
  courseId: number;
  assignmentId: number;
};
export type ParsedUri =
  | ParsedSyllabusUri
  | ParsedAnnouncementUri
  | ParsedContentTopicUri
  | ParsedAssignmentFilesUri;

export function parseUri(uri: string): ParsedUri | null {
  if (!uri.startsWith('brightspace://')) return null;
  const path = uri.slice('brightspace://'.length);
  const parts = path.split('/');
  const courseId = parseInt(parts[0] ?? '', 10);
  if (!Number.isFinite(courseId) || courseId <= 0) return null;

  if (parts.length === 2 && parts[1] === 'syllabus') {
    return { type: 'syllabus', courseId };
  }
  if (parts.length === 3 && parts[1] === 'announcements' && parts[2]) {
    return { type: 'announcement', courseId, announcementId: parts[2] };
  }
  if (parts.length === 4 && parts[1] === 'content' && parts[2] === 'topics' && parts[3]) {
    const topicId = parseInt(parts[3], 10);
    if (!Number.isFinite(topicId) || topicId <= 0) return null;
    return { type: 'content-topic', courseId, topicId };
  }
  if (parts.length === 4 && parts[1] === 'assignments' && parts[3] === 'files' && parts[2]) {
    const assignmentId = parseInt(parts[2], 10);
    if (!Number.isFinite(assignmentId) || assignmentId <= 0) return null;
    return { type: 'assignment-files', courseId, assignmentId };
  }
  return null;
}
