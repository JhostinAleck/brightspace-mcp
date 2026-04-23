import type { GradeRepository } from '@/contexts/grades/domain/GradeRepository.js';
import type { Grade } from '@/contexts/grades/domain/Grade.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export class FakeGradeRepository implements GradeRepository {
  constructor(private readonly perCourse: Map<number, Grade[]>) {}

  async findByCourse(courseId: OrgUnitId): Promise<Grade[]> {
    const key = OrgUnitId.toNumber(courseId);
    return this.perCourse.get(key) ?? [];
  }
}
