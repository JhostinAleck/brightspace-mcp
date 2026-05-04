import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export class FakeContentRepository implements ContentRepository {
  constructor(
    private readonly syllabusByCourse: Map<number, Syllabus> = new Map(),
    private readonly modulesByCourse: Map<number, Module[]> = new Map(),
  ) {}

  async findSyllabus(courseId: OrgUnitId): Promise<Syllabus | null> {
    return this.syllabusByCourse.get(OrgUnitId.toNumber(courseId)) ?? null;
  }

  async findModules(courseId: OrgUnitId): Promise<Module[]> {
    return this.modulesByCourse.get(OrgUnitId.toNumber(courseId)) ?? [];
  }

  async findTopicFile(_courseId: OrgUnitId, _topicId: number): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async findTopicRenderedText(_courseId: OrgUnitId, _topicId: number): Promise<string> {
    return '';
  }
}
