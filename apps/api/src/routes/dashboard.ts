import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  chats,
  chatMembers,
  calendarEvents,
  eventAttendees,
  tasks,
  documents,
  organizations,
  departmentMembers,
} from "../db/schema";
import { eq, and, desc, gte, inArray, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

interface WidgetConfig {
  id: string;
  type: "recent_chats" | "upcoming_events" | "my_tasks" | "recent_docs" | "app_launcher" | "quick_actions";
  enabled: boolean;
  position: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "recent_chats", type: "recent_chats", enabled: true, position: 0 },
  { id: "upcoming_events", type: "upcoming_events", enabled: true, position: 1 },
  { id: "my_tasks", type: "my_tasks", enabled: true, position: 2 },
  { id: "recent_docs", type: "recent_docs", enabled: true, position: 3 },
  { id: "app_launcher", type: "app_launcher", enabled: true, position: 4 },
  { id: "quick_actions", type: "quick_actions", enabled: true, position: 5 },
];

export const dashboardRoutes = async (fastify: FastifyInstance) => {
  /**
   * GET /dashboard - Get aggregated dashboard data
   */
  fastify.get(
    "/dashboard",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const orgId = (request as any).user.orgId;

      // Fetch recent chats (last 5 the user is a member of)
      const userChatIds = await db
        .select({ chatId: chatMembers.chatId })
        .from(chatMembers)
        .where(eq(chatMembers.userId, userId));

      let recentChats: any[] = [];
      if (userChatIds.length > 0) {
        const chatIds = userChatIds.map((c) => c.chatId);
        recentChats = await db
          .select({
            id: chats.id,
            name: chats.name,
            type: chats.type,
            updatedAt: chats.updatedAt,
          })
          .from(chats)
          .where(inArray(chats.id, chatIds))
          .orderBy(desc(chats.updatedAt))
          .limit(5);
      }

      // Fetch upcoming events (next 5)
      const now = new Date();
      let upcomingEvents: any[] = [];
      const myEventIds = await db
        .select({ eventId: eventAttendees.eventId })
        .from(eventAttendees)
        .where(eq(eventAttendees.userId, userId));

      if (myEventIds.length > 0) {
        const eventIds = myEventIds.map((e) => e.eventId);
        upcomingEvents = await db
          .select({
            id: calendarEvents.id,
            title: calendarEvents.title,
            startTime: calendarEvents.startTime,
            endTime: calendarEvents.endTime,
            location: calendarEvents.location,
          })
          .from(calendarEvents)
          .where(
            and(
              inArray(calendarEvents.id, eventIds),
              gte(calendarEvents.startTime, now)
            )
          )
          .orderBy(calendarEvents.startTime)
          .limit(5);
      }

      // Fetch my tasks (5 active, not done)
      const myTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.creatorId, userId),
            sql`${tasks.status} != 'done'`
          )
        )
        .orderBy(desc(tasks.createdAt))
        .limit(5);

      // Fetch recent docs (last 5 user has access to)
      let recentDocs: any[] = [];
      if (orgId) {
        recentDocs = await db
          .select({
            id: documents.id,
            title: documents.title,
            type: documents.type,
            updatedAt: documents.updatedAt,
          })
          .from(documents)
          .where(eq(documents.ownerId, userId))
          .orderBy(desc(documents.updatedAt))
          .limit(5);
      }

      return reply.send({
        recentChats,
        upcomingEvents,
        myTasks,
        recentDocs,
      });
    }
  );

  /**
   * GET /dashboard/config - Get dashboard widget config for current user's department
   */
  fastify.get(
    "/dashboard/config",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const orgId = (request as any).user.orgId;

      if (!orgId) {
        return reply.send({ widgets: DEFAULT_WIDGETS });
      }

      // Get user's department
      const membership = await db
        .select({ departmentId: departmentMembers.departmentId })
        .from(departmentMembers)
        .where(eq(departmentMembers.userId, userId))
        .limit(1);

      const departmentId = membership[0]?.departmentId || "default";

      // Get org settings
      const org = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      const settings = (org[0]?.settings || {}) as Record<string, unknown>;
      const dashboardConfig = (settings.dashboardWidgets || {}) as Record<string, WidgetConfig[]>;
      const widgets = dashboardConfig[departmentId] || dashboardConfig["default"] || DEFAULT_WIDGETS;

      return reply.send({ widgets, departmentId });
    }
  );

  /**
   * PUT /dashboard/config - Admin: configure default widgets per department
   * Body: { department_id?: string, widgets: WidgetConfig[] }
   */
  fastify.put<{
    Body: {
      department_id?: string;
      widgets: WidgetConfig[];
    };
  }>(
    "/dashboard/config",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = (request as any).user;
      const orgId = user.orgId;

      if (!orgId) {
        return reply.status(403).send({ error: "No organization" });
      }

      // Only admins/owners can configure
      if (user.role !== "owner" && user.role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { department_id, widgets } = request.body;
      const deptKey = department_id || "default";

      // Validate widgets
      if (!Array.isArray(widgets) || widgets.length === 0) {
        return reply.status(400).send({ error: "widgets must be a non-empty array" });
      }

      // Get current org settings
      const org = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      const settings = (org[0]?.settings || {}) as Record<string, unknown>;
      const dashboardConfig = ((settings.dashboardWidgets || {}) as Record<string, WidgetConfig[]>);
      dashboardConfig[deptKey] = widgets;

      await db
        .update(organizations)
        .set({
          settings: { ...settings, dashboardWidgets: dashboardConfig },
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, orgId));

      return reply.send({ success: true, widgets, departmentId: deptKey });
    }
  );
};
