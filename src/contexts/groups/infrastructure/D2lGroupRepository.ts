import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { Group, type GroupMember, type GroupRepository } from '@/contexts/groups/domain/Group.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

interface CategoryDto {
  GroupCategoryId: number;
  Name: string;
  Groups?: number[];
}

interface GroupDto {
  GroupId: number;
  Name: string;
  Enrollments?: number[];
}

interface UserDto {
  Identifier: string | number;
  DisplayName?: string;
  UserName?: string;
}

interface ClasslistEntry {
  Identifier: string;
  DisplayName?: string;
  UserName?: string;
}

export interface D2lGroupRepositoryOptions {
  lp: string;
}

/**
 * Group enrolment lookup. D2L exposes group categories per course
 * (GET /lp/{ver}/{ou}/groupcategories/), each containing groups
 * (GET /lp/{ver}/{ou}/groupcategories/{cid}/groups/), each having
 * `Enrollments: [userId, ...]`.
 *
 * To filter to "my groups" we need to know our own user id. We get it from
 * /lp/{ver}/users/whoami. To enrich members with names we query the course
 * classlist (already accessible to students).
 */
export class D2lGroupRepository implements GroupRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lGroupRepositoryOptions,
  ) {}

  async findMyGroups(courseId: OrgUnitId): Promise<Group[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const me = await this.client.get<UserDto>(`/d2l/api/lp/${this.versions.lp}/users/whoami`);
    const myId = Number(me.Identifier);
    if (!Number.isFinite(myId)) return [];

    let categories: CategoryDto[];
    try {
      categories = await this.client.get<CategoryDto[]>(
        `/d2l/api/lp/${this.versions.lp}/${orgUnit}/groupcategories/`,
      );
    } catch {
      // 404 → no group categories defined in this course.
      return [];
    }

    // Best-effort classlist for member names — courses where the student
    // doesn't have classlist access just get unnamed members.
    let classlistById: Map<number, ClasslistEntry> = new Map();
    try {
      const classlist = await this.client.get<ClasslistEntry[]>(
        `/d2l/api/lp/${this.versions.lp}/${orgUnit}/classlist/`,
      );
      classlistById = new Map(
        classlist
          .filter((c) => Number.isFinite(Number(c.Identifier)))
          .map((c) => [Number(c.Identifier), c]),
      );
    } catch { /* keep empty */ }

    const result: Group[] = [];
    for (const cat of categories) {
      let groups: GroupDto[];
      try {
        groups = await this.client.get<GroupDto[]>(
          `/d2l/api/lp/${this.versions.lp}/${orgUnit}/groupcategories/${cat.GroupCategoryId}/groups/`,
        );
      } catch { continue; }
      for (const g of groups) {
        if (!(g.Enrollments ?? []).includes(myId)) continue;
        const members: GroupMember[] = (g.Enrollments ?? []).map((uid) => {
          const cl = classlistById.get(uid);
          const m: GroupMember = {
            userId: uid,
            displayName: cl?.DisplayName ?? `User ${uid}`,
          };
          if (cl?.UserName !== undefined) m.username = cl.UserName;
          return m;
        });
        result.push(new Group({
          id: g.GroupId,
          categoryId: cat.GroupCategoryId,
          categoryName: cat.Name,
          name: g.Name,
          members,
        }));
      }
    }
    return result;
  }
}
