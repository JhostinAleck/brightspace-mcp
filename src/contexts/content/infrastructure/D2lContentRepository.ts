import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import { Module } from '@/contexts/content/domain/Module.js';
import { Topic, type TopicKind } from '@/contexts/content/domain/Topic.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

interface OverviewDto {
  Description?: { Text?: string | null; Html?: string | null } | null;
  UpdatedDate?: string | null;
}

interface ModuleDto {
  Id: number;
  Title: string;
  StartDate?: string | null;
  EndDate?: string | null;
}

interface TopicOrModuleDto {
  Id: number;
  Title: string;
  Type: number; // 0 = module, 1 = topic
  TypeIdentifier?: string;
  Url?: string | null;
  FileExtension?: string | null;
}

export interface D2lContentRepositoryOptions {
  le: string;
}

export class D2lContentRepository implements ContentRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lContentRepositoryOptions,
  ) {}

  async findSyllabus(courseId: OrgUnitId): Promise<Syllabus | null> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    try {
      const dto = await this.client.get<OverviewDto>(
        `/d2l/api/le/${this.versions.le}/${orgUnit}/overview`,
      );
      const html = dto.Description?.Html ?? dto.Description?.Text ?? null;
      if (!html) return null;
      return new Syllabus({
        courseOrgUnitId: orgUnit,
        title: 'Course Syllabus',
        html,
        updatedAt: dto.UpdatedDate ? new Date(dto.UpdatedDate) : null,
        sourceUrl: null,
      });
    } catch (err) {
      if (err instanceof D2lApiError && err.status === 404) return null;
      throw err;
    }
  }

  async findTopicFile(courseId: OrgUnitId, topicId: number): Promise<Buffer> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    return this.client.getRaw(`/d2l/api/le/${this.versions.le}/${orgUnit}/content/topics/${topicId}/file`);
  }

  async findTopicRenderedText(courseId: OrgUnitId, topicId: number): Promise<string> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    return this.client.getRenderedText(`/d2l/le/content/${orgUnit}/viewContent/${topicId}/View`);
  }

  async findModules(courseId: OrgUnitId): Promise<Module[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const roots = await this.client.get<ModuleDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/content/root/`,
    );
    return Promise.all(roots.map((r) => this.buildModule(orgUnit, r)));
  }

  private async buildModule(orgUnit: number, dto: ModuleDto): Promise<Module> {
    const children = await this.client.get<TopicOrModuleDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/content/modules/${dto.Id}/structure/`,
    );
    const topics: Topic[] = [];
    const submodules: Module[] = [];
    for (const c of children) {
      if (c.Type === 0) {
        submodules.push(await this.buildModule(orgUnit, { Id: c.Id, Title: c.Title }));
      } else {
        topics.push(
          new Topic({
            id: c.Id,
            title: c.Title,
            kind: this.classifyTopic(c.TypeIdentifier),
            url: c.Url ?? null,
            fileExtension: c.FileExtension ?? null,
          }),
        );
      }
    }
    return new Module({ id: dto.Id, title: dto.Title, topics, submodules });
  }

  private classifyTopic(typeId: string | undefined): TopicKind {
    switch (typeId?.toLowerCase()) {
      case 'file':
        return 'file';
      case 'link':
        return 'link';
      case 'quiz':
        return 'quiz';
      case 'dropbox':
        return 'dropbox';
      case 'discussion':
        return 'discussion';
      default:
        return 'other';
    }
  }
}
