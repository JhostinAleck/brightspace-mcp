import type { CourseRepository } from '@/contexts/courses/CourseRepository.js';
import { Course, type CourseProps } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';

interface EnrollmentDto {
  OrgUnit: { Id: number; Name: string; Code: string; Type: { Code: string } };
  Access: { IsActive: boolean; StartDate?: string | null; EndDate?: string | null };
}
interface EnrollmentsPage {
  Items: EnrollmentDto[];
}

export interface D2lCourseRepositoryOptions {
  le: string;
}

export class D2lCourseRepository implements CourseRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lCourseRepositoryOptions,
  ) {}

  async findMyCourses(opts?: { activeOnly?: boolean }): Promise<Course[]> {
    const page = await this.client.get<EnrollmentsPage>(
      `/d2l/api/le/${this.versions.le}/enrollments/myenrollments/`,
    );
    const courses = page.Items.filter((e) => e.OrgUnit.Type.Code === 'Course').map((e) => {
      const props: CourseProps = {
        id: CourseId.of(e.OrgUnit.Id),
        name: e.OrgUnit.Name,
        code: e.OrgUnit.Code,
        active: e.Access.IsActive,
      };
      if (e.Access.StartDate) props.startDate = new Date(e.Access.StartDate);
      if (e.Access.EndDate) props.endDate = new Date(e.Access.EndDate);
      return new Course(props);
    });
    return opts?.activeOnly ? courses.filter((c) => c.active) : courses;
  }

  async findById(id: CourseId): Promise<Course | null> {
    const all = await this.findMyCourses();
    return all.find((c) => CourseId.toNumber(c.id) === CourseId.toNumber(id)) ?? null;
  }
}
