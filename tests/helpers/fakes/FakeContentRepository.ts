import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import type { CourseFilePath } from '@/contexts/content/domain/CourseFilePath.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export class FakeContentRepository implements ContentRepository {
  constructor(
    private readonly syllabusByCourse: Map<number, Syllabus> = new Map(),
    private readonly modulesByCourse: Map<number, Module[]> = new Map(),
    /** Topic file bytes keyed by topic id; unknown topics return an empty buffer. */
    private readonly topicFiles: Map<number, Buffer> = new Map(),
  ) {}

  /** Topic ids passed to findTopicFile, in call order. */
  readonly topicFileRequests: number[] = [];

  async findSyllabus(courseId: OrgUnitId): Promise<Syllabus | null> {
    return this.syllabusByCourse.get(OrgUnitId.toNumber(courseId)) ?? null;
  }

  async findModules(courseId: OrgUnitId): Promise<Module[]> {
    return this.modulesByCourse.get(OrgUnitId.toNumber(courseId)) ?? [];
  }

  async findTopicFile(_courseId: OrgUnitId, topicId: number): Promise<Buffer> {
    this.topicFileRequests.push(topicId);
    return this.topicFiles.get(topicId) ?? Buffer.alloc(0);
  }

  async findTopicRenderedText(_courseId: OrgUnitId, _topicId: number): Promise<string> {
    return '';
  }

  async findCourseFile(_courseId: OrgUnitId, _path: CourseFilePath): Promise<Buffer> {
    return Buffer.alloc(0);
  }
}
