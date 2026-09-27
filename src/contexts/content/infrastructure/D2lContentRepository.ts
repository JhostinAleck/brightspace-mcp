import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { CourseFilePath } from '@/contexts/content/domain/CourseFilePath.js';
import { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import { Module } from '@/contexts/content/domain/Module.js';
import { Topic, type TopicKind } from '@/contexts/content/domain/Topic.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AuthExpiredError, D2lApiError } from '@/contexts/http-api/errors.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

interface RichTextDto {
  Text?: string | null;
  Html?: string | null;
}

interface OverviewDto {
  Description?: RichTextDto | null;
  UpdatedDate?: string | null;
}

/** Fields shared by topics in /content/toc and /content/modules/{id}/structure/. */
interface TopicFieldsDto {
  Title: string;
  Url?: string | null;
  IsBroken?: boolean | null;
  /** ACTIVITYTYPE_T: 1 File, 2 Link, 3 Dropbox, 4 Quiz, 5/6 Discussion, 7 LTI, … */
  ActivityType?: number | null;
  /** TOPIC_T (structure endpoint only): 1 File, 3 Link. */
  TopicType?: number | null;
  /** "File" / "Link" (toc endpoint); older tenants sometimes send "Quiz" etc. */
  TypeIdentifier?: string | null;
  FileExtension?: string | null;
}

interface TocTopicDto extends TopicFieldsDto {
  TopicId: number;
}

interface TocModuleDto {
  ModuleId: number;
  Title: string;
  Description?: RichTextDto | null;
  Modules?: TocModuleDto[] | null;
  Topics?: TocTopicDto[] | null;
}

interface TocDto {
  Modules?: TocModuleDto[] | null;
}

interface ModuleDto {
  Id: number;
  Title: string;
  Description?: RichTextDto | null;
}

interface TopicOrModuleDto extends TopicFieldsDto {
  Id: number;
  Type: number; // 0 = module, 1 = topic
  Description?: RichTextDto | null;
}

export interface D2lContentRepositoryOptions {
  le: string;
}

const MAX_DEPTH = 12;

const ACTIVITY_KIND: Record<number, TopicKind> = {
  1: 'file',
  2: 'link',
  3: 'dropbox',
  4: 'quiz',
  5: 'discussion',
  6: 'discussion',
  7: 'lti',
};

const QUICKLINK_KIND: Record<string, TopicKind> = {
  quiz: 'quiz',
  lti: 'lti',
  dropbox: 'dropbox',
  discuss: 'discussion',
  discussion: 'discussion',
};

function quicklinkType(url: string | null | undefined): string | null {
  if (!url || !url.includes('quickLink.d2l')) return null;
  const m = /[?&]type=([a-z]+)/i.exec(url);
  return m ? (m[1] ?? '').toLowerCase() : null;
}

/**
 * Classify a topic. D2L's content endpoints do not reliably send a textual
 * type: /structure/ has only TopicType/ActivityType, /toc has a coarse
 * "File"/"Link" TypeIdentifier. ActivityType is the most specific signal, a
 * quicklink URL's `type=` param comes next, then TopicType/TypeIdentifier.
 */
export function classifyTopic(dto: TopicFieldsDto): TopicKind {
  const byActivity = dto.ActivityType != null ? ACTIVITY_KIND[dto.ActivityType] : undefined;
  if (byActivity) return byActivity;
  const ql = quicklinkType(dto.Url);
  if (ql && QUICKLINK_KIND[ql]) return QUICKLINK_KIND[ql];
  if (dto.TopicType === 1) return 'file';
  if (dto.TopicType === 3) return 'link';
  switch (dto.TypeIdentifier?.toLowerCase()) {
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
    case 'lti':
      return 'lti';
    default:
      return 'other';
  }
}

function extensionOf(dto: TopicFieldsDto): string | null {
  if (dto.FileExtension) return dto.FileExtension.replace(/^\./, '').toLowerCase();
  const url = dto.Url;
  if (!url || !url.startsWith('/content/')) return null;
  const path = url.split(/[?#]/)[0] ?? '';
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : null;
}

function toTopic(id: number, dto: TopicFieldsDto): Topic {
  return new Topic({
    id,
    title: dto.Title,
    kind: classifyTopic(dto),
    url: dto.Url ?? null,
    fileExtension: extensionOf(dto),
    isBroken: dto.IsBroken === true,
  });
}

function descriptionOf(d: RichTextDto | null | undefined): string | null {
  const html = d?.Html?.trim();
  if (html) return html;
  const text = d?.Text?.trim();
  return text ? text : null;
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
      // An overview that exists but is blank is returned with empty html (not
      // null) so callers can tell "not published (404)" from "published empty".
      const html = dto.Description?.Html || dto.Description?.Text || '';
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

  async findCourseFile(_courseId: OrgUnitId, path: CourseFilePath): Promise<Buffer> {
    // `path` is already validated to live under this course's /content/enforced/ area.
    return this.client.getRaw(path.path);
  }

  /**
   * One GET /content/toc returns the whole tree (modules, descriptions and
   * topics). Falls back to root + per-module /structure/ calls on tenants
   * where the toc route is unavailable.
   */
  async findModules(courseId: OrgUnitId): Promise<Module[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    let toc: TocDto;
    try {
      toc = await this.client.get<TocDto>(`/d2l/api/le/${this.versions.le}/${orgUnit}/content/toc`);
    } catch (err) {
      const unavailable = err instanceof D2lApiError && !(err instanceof AuthExpiredError) &&
        [403, 404, 501].includes(err.status);
      if (unavailable) {
        return this.findModulesViaStructure(orgUnit);
      }
      throw err;
    }
    return (toc.Modules ?? []).map((m) => this.fromToc(m, 0));
  }

  private fromToc(dto: TocModuleDto, depth: number): Module {
    const submodules = depth >= MAX_DEPTH ? [] : (dto.Modules ?? []).map((m) => this.fromToc(m, depth + 1));
    return new Module({
      id: dto.ModuleId,
      title: dto.Title,
      topics: (dto.Topics ?? []).map((t) => toTopic(t.TopicId, t)),
      submodules,
      descriptionHtml: descriptionOf(dto.Description),
    });
  }

  private async findModulesViaStructure(orgUnit: number): Promise<Module[]> {
    const roots = await this.client.get<ModuleDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/content/root/`,
    );
    return Promise.all(roots.map((r) => this.buildModule(orgUnit, r)));
  }

  private async buildModule(orgUnit: number, dto: ModuleDto, depth = 0): Promise<Module> {
    const descriptionHtml = descriptionOf(dto.Description);
    if (depth > MAX_DEPTH) {
      // Pathological tree guard — D2L module trees are typically <5 deep.
      // Stop recursing rather than blowing the stack.
      return new Module({ id: dto.Id, title: dto.Title, topics: [], submodules: [], descriptionHtml });
    }
    const children = await this.client.get<TopicOrModuleDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/content/modules/${dto.Id}/structure/`,
    );
    const topics: Topic[] = [];
    const submoduleDtos: ModuleDto[] = [];
    for (const c of children) {
      if (c.Type === 0) {
        submoduleDtos.push({ Id: c.Id, Title: c.Title, Description: c.Description ?? null });
      } else {
        topics.push(toTopic(c.Id, c));
      }
    }
    // Parallel descent — bulkhead caps backend pressure.
    const submodules = await Promise.all(
      submoduleDtos.map((m) => this.buildModule(orgUnit, m, depth + 1)),
    );
    return new Module({ id: dto.Id, title: dto.Title, topics, submodules, descriptionHtml });
  }
}
