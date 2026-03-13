import { FastifyInstance } from "fastify";
import { db } from "../db";
import { users, departments, departmentMembers } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { getOnlineUsers, isUserOnline } from "../lib/redis";

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
  status?: "active" | "away" | "busy" | "offline";
  status_text?: string | null;
  status_emoji?: string | null;
  theme?: "light" | "dark" | "system";
}

interface WorkingHoursCheckBody {
  user_ids: string[];
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
        status,
        status_text,
        status_emoji,
        theme,
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
        status: "active" | "away" | "busy" | "offline";
        statusText: string | null;
        statusEmoji: string | null;
        theme: "light" | "dark" | "system";
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

      // Validate and set status
      if (status !== undefined) {
        const validStatuses = ["active", "away", "busy", "offline"] as const;
        if (!validStatuses.includes(status)) {
          return reply.status(400).send({
            error: "Invalid status. Must be one of: active, away, busy, offline",
          });
        }
        updates.status = status;
      }

      // Set status text (can be null to clear)
      if (status_text !== undefined) {
        if (status_text && status_text.length > 100) {
          return reply.status(400).send({
            error: "Status text must be 100 characters or less",
          });
        }
        updates.statusText = status_text || null;
      }

      // Set status emoji (can be null to clear)
      if (status_emoji !== undefined) {
        updates.statusEmoji = status_emoji || null;
      }

      // Validate and set theme
      if (theme !== undefined) {
        const validThemes = ["light", "dark", "system"] as const;
        if (!validThemes.includes(theme)) {
          return reply.status(400).send({
            error: "Invalid theme. Must be one of: light, dark, system",
          });
        }
        updates.theme = theme;
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
          statusText: users.statusText,
          statusEmoji: users.statusEmoji,
          theme: users.theme,
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
          statusText: users.statusText,
          statusEmoji: users.statusEmoji,
          timezone: users.timezone,
          workingHoursStart: users.workingHoursStart,
          workingHoursEnd: users.workingHoursEnd,
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

      // Check online presence
      const isOnline = await isUserOnline(user.id);

      return reply.status(200).send({
        user: {
          id: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          status: user.status,
          statusText: user.statusText,
          statusEmoji: user.statusEmoji,
          timezone: user.timezone,
          workingHoursStart: user.workingHoursStart,
          workingHoursEnd: user.workingHoursEnd,
          isOnline,
          departments: userDepartments,
        },
      });
    }
  );

  /**
   * POST /users/presence - Get online presence for multiple users
   */
  fastify.post<{ Body: { user_ids: string[] } }>(
    "/users/presence",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { user_ids } = request.body;

      if (!Array.isArray(user_ids)) {
        return reply.status(400).send({
          error: "user_ids must be an array",
        });
      }

      if (user_ids.length === 0) {
        return reply.status(200).send({ presence: {} });
      }

      if (user_ids.length > 100) {
        return reply.status(400).send({
          error: "Maximum 100 user IDs allowed",
        });
      }

      // Validate all UUIDs
      for (const id of user_ids) {
        if (!UUID_REGEX.test(id)) {
          return reply.status(400).send({
            error: `Invalid user ID format: ${id}`,
          });
        }
      }

      const onlineSet = await getOnlineUsers(user_ids);

      const presence: Record<string, boolean> = {};
      for (const userId of user_ids) {
        presence[userId] = onlineSet.has(userId);
      }

      return reply.status(200).send({ presence });
    }
  );

  /**
   * POST /users/working-hours-check - Check if users are within their working hours
   */
  fastify.post<{ Body: WorkingHoursCheckBody }>(
    "/users/working-hours-check",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { user_ids } = request.body;

      if (!Array.isArray(user_ids) || user_ids.length === 0) {
        return reply.status(400).send({ error: "user_ids must be a non-empty array" });
      }

      if (user_ids.length > 100) {
        return reply.status(400).send({ error: "Maximum 100 user IDs allowed" });
      }

      for (const id of user_ids) {
        if (!UUID_REGEX.test(id)) {
          return reply.status(400).send({ error: `Invalid user ID format: ${id}` });
        }
      }

      const result: Record<string, { withinWorkingHours: boolean; workingHoursStart: string | null; workingHoursEnd: string | null; timezone: string | null }> = {};

      for (const userId of user_ids) {
        const [user] = await db
          .select({
            timezone: users.timezone,
            workingHoursStart: users.workingHoursStart,
            workingHoursEnd: users.workingHoursEnd,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user || !user.workingHoursStart || !user.workingHoursEnd) {
          result[userId] = { withinWorkingHours: true, workingHoursStart: null, workingHoursEnd: null, timezone: null };
          continue;
        }

        // Calculate current time in user's timezone
        const tz = user.timezone || "UTC";
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const parts = formatter.formatToParts(now);
        const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
        const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
        const currentMinutes = hour * 60 + minute;

        const [startH, startM] = user.workingHoursStart.split(":").map(Number);
        const [endH, endM] = user.workingHoursEnd.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        const withinWorkingHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

        result[userId] = {
          withinWorkingHours,
          workingHoursStart: user.workingHoursStart,
          workingHoursEnd: user.workingHoursEnd,
          timezone: tz,
        };
      }

      return reply.status(200).send({ workingHours: result });
    }
  );
}
