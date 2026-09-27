import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { findModule } from '@/contexts/content/domain/ContentTree.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetModuleInput {
  repo: ContentRepository;
  courseId: OrgUnitId;
  moduleId: number;
}

export async function getModule(input: GetModuleInput): Promise<Module | null> {
  return findModule(await input.repo.findModules(input.courseId), input.moduleId);
}
