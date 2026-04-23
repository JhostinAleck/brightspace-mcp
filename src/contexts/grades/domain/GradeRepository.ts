import type { Grade } from './Grade.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GradeRepository {
  findByCourse(courseId: OrgUnitId): Promise<Grade[]>;
}
