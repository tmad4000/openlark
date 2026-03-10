import { FastifyInstance } from "fastify";
import { db } from "../db";
import { users, departments, departmentMembers } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

interface UserParams {
  id: string;
}

interface UpdateProfileBody {
  display_name?: string;
  avatar_url?: string;
  timezone?: string;
  locale?: string;
  working_hours_start?: string;
  working_hours_end?: string;
  phone?: string;
}

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Time format validation (HH:MM:SS or HH:MM)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export async function usersRoutes(fastify: FastifyInstance) {
  /**
   * GET /users/me - Returns current user profile with departments
   */
  fastify.get(
    "/users/me",
    { preHandler: authMiddleware },
    async (request, reply) => {
      // Get user's department memberships with department details
      const membershipRows = await db
        .select({
          departmentId: departmentMembers.departmentId,
          departmentName: departments.name,
          role: departmentMembers.role,
          joinedAt: departmentMembers.createdAt,
        })
        .from(departmentMembers)
        .innerJoin(departments, eq(departmentMembers.departmentId, departments.id))
        .where(eq(departmentMembers.userId, request.user.id));

      const userDepartments = membershipRows.map((row) => ({
        id: row.departmentId,
        name: row.departmentName,
        role: row.role,
        joinedAt: row.joinedAt,
      }));

      return reply.status(200).send({
        user: {
          ...request.user,
          departments: userDepartments,
        },
      });
    }
  );

  /**
   * PATCH /users/me - Update current user profile
   */
  fastify.patch<{ Body: UpdateProfileBody }>(
    "/users/me",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const {
        display_name,
        avatar_url,
        timezone,
        locale,
        working_hours_start,
        working_hours_end,
        phone,
      } = request.body;

      // Build update object
      const updates: Partial<{
        displayName: string;
        avatarUrl: string | null;
        timezone: string;
        locale: string;
        workingHoursStart: string;
        workingHoursEnd: string;
        phone: string | null;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      // Validate and set display_name
      if (display_name !== undefined) {
        if (display_name.trim().length === 0) {
          return reply.status(400).send({
            error: "Display name cannot be empty",
          });
        }
        updates.displayName = display_name.trim();
      }

      // Set avatar_url (can be null to clear)
      if (avatar_url !== undefined) {
        updates.avatarUrl = avatar_url || null;
      }

      // Validate and set timezone
      if (timezone !== undefined) {
        if (timezone.trim().length === 0) {
          return reply.status(400).send({
            error: "Timezone cannot be empty",
          });
        }
        updates.timezone = timezone.trim();
      }

      // Validate and set locale
      if (locale !== undefined) {
        if (locale.trim().length === 0) {
          return reply.status(400).send({
            error: "Locale cannot be empty",
          });
        }
        updates.locale = locale.trim();
      }

      // Validate and set working_hours_start
      if (working_hours_start !== undefined) {
        if (working_hours_start !== null && !TIME_REGEX.test(working_hours_start)) {
          return reply.status(400).send({
            error: "Invalid working_hours_start format. Use HH:MM or HH:MM:SS",
          });
        }
        updates.workingHoursStart = working_hours_start || undefined;
      }

      // Validate and set working_hours_end
      if (working_hours_end !== undefined) {
        if (working_hours_end !== null && !TIME_REGEX.test(working_hours_end)) {
          return reply.status(400).send({
            error: "Invalid working_hours_end format. Use HH:MM or HH:MM:SS",
          });
        }
        updates.workingHoursEnd = working_hours_end || undefined;
      }

      // Set phone (can be null to clear)
      if (phone !== undefined) {
        updates.phone = phone || null;
      }

      // Update user
      const [updatedUser] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, request.user.id))
        .returning({
          id: users.id,
          email: users.email,
          phone: users.phone,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          timezone: users.timezone,
          locale: users.locale,
          status: users.status,
          workingHoursStart: users.workingHoursStart,
          workingHoursEnd: users.workingHoursEnd,
          orgId: users.orgId,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      // Get updated department memberships
      const membershipRows = await db
        .select({
          departmentId: departmentMembers.departmentId,
          departmentName: departments.name,
          role: departmentMembers.role,
          joinedAt: departmentMembers.createdAt,
        })
        .from(departmentMembers)
        .innerJoin(departments, eq(departmentMembers.departmentId, departments.id))
        .where(eq(departmentMembers.userId, updatedUser.id));

      const userDepartments = membershipRows.map((row) => ({
        id: row.departmentId,
        name: row.departmentName,
        role: row.role,
        joinedAt: row.joinedAt,
      }));

      return reply.status(200).send({
        user: {
          ...updatedUser,
          departments: userDepartments,
        },
      });
    }
  );

  /**
   * GET /users/:id - Returns public profile (name, avatar, status, department)
   */
  fastify.get<{ Params: UserParams }>(
    "/users/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid user ID format",
        });
      }

      // Find user
      const [user] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
          orgId: users.orgId,
        })
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);

      if (!user) {
        return reply.status(404).send({
          error: "User not found",
        });
      }

      // Only allow viewing users in the same organization
      if (user.orgId !== request.user.orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Get user's department memberships
      const membershipRows = await db
        .select({
          departmentId: departmentMembers.departmentId,
          departmentName: departments.name,
          role: departmentMembers.role,
        })
        .from(departmentMembers)
        .innerJoin(departments, eq(departmentMembers.departmentId, departments.id))
        .where(eq(departmentMembers.userId, id));

      const userDepartments = membershipRows.map((row) => ({
        id: row.departmentId,
        name: row.departmentName,
        role: row.role,
      }));

      return reply.status(200).send({
        user: {
          id: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          status: user.status,
          departments: userDepartments,
        },
      });
    }
  );
}
