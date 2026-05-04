import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import { Module } from '@/contexts/content/domain/Module.js';
import { Topic, type TopicKind } from '@/contexts/content/domain/Topic.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { Cache } from '@/shared-kernel/cache/Cache.js';

export interface CachedContentRepositoryTtls {
  syllabusTtlMs: number;
  modulesTtlMs: number;
}

const PREFIX = 'content:';

interface SyllabusPlain {
  courseOrgUnitId: number;
  title: string;
  html: string | null;
  updatedAtIso: string | null;
  sourceUrl: string | null;
}

interface TopicPlain {
  id: number;
  title: string;
  kind: TopicKind;
  url: string | null;
  fileExtension: string | null;
}

interface ModulePlain {
  id: number;
  title: string;
  topics: TopicPlain[];
  submodules: ModulePlain[];
}

type CachedSyllabus = { kind: 'value'; value: SyllabusPlain } | { kind: 'none' };

function syllabusToPlain(s: Syllabus): SyllabusPlain {
  return {
    courseOrgUnitId: s.courseOrgUnitId,
    title: s.title,
    html: s.html,
    updatedAtIso: s.updatedAt ? s.updatedAt.toISOString() : null,
    sourceUrl: s.sourceUrl,
  };
}

function syllabusFromPlain(p: SyllabusPlain): Syllabus {
  return new Syllabus({
    courseOrgUnitId: p.courseOrgUnitId,
    title: p.title,
    html: p.html,
    updatedAt: p.updatedAtIso ? new Date(p.updatedAtIso) : null,
    sourceUrl: p.sourceUrl,
  });
}

function topicToPlain(t: Topic): TopicPlain {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    url: t.url,
    fileExtension: t.fileExtension,
  };
}

function topicFromPlain(p: TopicPlain): Topic {
  return new Topic(p);
}

function moduleToPlain(m: Module): ModulePlain {
  return {
    id: m.id,
    title: m.title,
    topics: m.topics.map(topicToPlain),
    submodules: m.submodules.map(moduleToPlain),
  };
}

function moduleFromPlain(p: ModulePlain): Module {
  return new Module({
    id: p.id,
    title: p.title,
    topics: p.topics.map(topicFromPlain),
    submodules: p.submodules.map(moduleFromPlain),
  });
}

export class CachedContentRepository implements ContentRepository {
  constructor(
    private readonly inner: ContentRepository,
    private readonly cache: Cache,
    private readonly ttls: CachedContentRepositoryTtls,
  ) {}

  async findSyllabus(courseId: OrgUnitId): Promise<Syllabus | null> {
    const key = `${PREFIX}syllabus:${OrgUnitId.toNumber(courseId)}`;
    const cached = await this.cache.get<CachedSyllabus>(key);
    if (cached) return cached.kind === 'value' ? syllabusFromPlain(cached.value) : null;
    const fresh = await this.inner.findSyllabus(courseId);
    const toStore: CachedSyllabus = fresh ? { kind: 'value', value: syllabusToPlain(fresh) } : { kind: 'none' };
    await this.cache.set(key, toStore, this.ttls.syllabusTtlMs);
    return fresh;
  }

  async findTopicFile(courseId: OrgUnitId, topicId: number): Promise<Buffer> {
    return this.inner.findTopicFile(courseId, topicId);
  }

  async findModules(courseId: OrgUnitId): Promise<Module[]> {
    const key = `${PREFIX}modules:${OrgUnitId.toNumber(courseId)}`;
    const cached = await this.cache.get<ModulePlain[]>(key);
    if (cached) return cached.map(moduleFromPlain);
    const fresh = await this.inner.findModules(courseId);
    await this.cache.set(key, fresh.map(moduleToPlain), this.ttls.modulesTtlMs);
    return fresh;
  }
}
