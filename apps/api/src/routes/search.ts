import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  users,
  messages,
  chatMembers,
  chats,
  documents,
  calendarEvents,
  eventAttendees,
  tasks,
  emailMessages,
  mailboxes,
} from "../db/schema";
import { eq, and, ilike, or, isNull, sql, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

interface SearchQuery {
  q?: string;
  category?: string;
  limit?: string;
}

const SEARCH_LIMIT = 10;
const MAX_LIMIT = 50;

export async function searchRoutes(fastify: FastifyInstance) {
  /**
   * GET /search - Global search across all modules
   * Query params:
   *   - q: search query string (required, min 1 char)
   *   - category: filter to a specific category (all, messages, docs, events, contacts, tasks, email)
   *   - limit: results per category (default 10, max 50)
   */
  fastify.get<{ Querystring: SearchQuery }>(
    "/search",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { q, category = "all", limit: limitParam } = request.query;

      if (!q || q.trim().length === 0) {
        return reply.status(400).send({ error: "Search query is required" });
      }

      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization to search",
        });
      }

      const orgId = request.user.orgId;
      const userId = request.user.id;
      const searchTerm = `%${q.trim()}%`;

      let limit = SEARCH_LIMIT;
      if (limitParam) {
        const parsed = parseInt(limitParam, 10);
        if (!isNaN(parsed) && parsed > 0) {
          limit = Math.min(parsed, MAX_LIMIT);
        }
      }

      const results: Record<string, unknown[]> = {};

      // Search contacts (users in same org)
      if (category === "all" || category === "contacts") {
        const contactResults = await db
          .select({
            id: users.id,
            title: users.displayName,
            email: users.email,
            avatarUrl: users.avatarUrl,
            status: users.status,
          })
          .from(users)
          .where(
            and(
              eq(users.orgId, orgId),
              isNull(users.deletedAt),
              or(
                ilike(users.displayName, searchTerm),
                ilike(users.email, searchTerm)
              )
            )
          )
          .limit(limit);

        results.contacts = contactResults.map((c) => ({
          id: c.id,
          title: c.title || c.email,
          snippet: c.email,
          module: "contacts",
          icon: "user",
          avatarUrl: c.avatarUrl,
          href: `/app/messenger`,
          timestamp: null,
        }));
      }

      // Search messages (only in chats the user is a member of)
      if (category === "all" || category === "messages") {
        const messageResults = await db
          .select({
            id: messages.id,
            content: messages.content,
            chatId: messages.chatId,
            chatName: chats.name,
            chatType: chats.type,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .innerJoin(chats, eq(messages.chatId, chats.id))
          .innerJoin(
            chatMembers,
            and(
              eq(chatMembers.chatId, chats.id),
              eq(chatMembers.userId, userId)
            )
          )
          .where(
            and(
              eq(chats.orgId, orgId),
              isNull(messages.recalledAt),
              sql`${messages.content}::text ILIKE ${searchTerm}`
            )
          )
          .orderBy(desc(messages.createdAt))
          .limit(limit);

        results.messages = messageResults.map((m) => {
          const contentStr =
            typeof m.content === "object" && m.content !== null
              ? (m.content as Record<string, unknown>).text ||
                JSON.stringify(m.content)
              : String(m.content);
          return {
            id: m.id,
            title: m.chatName || "Direct Message",
            snippet:
              String(contentStr).length > 120
                ? String(contentStr).substring(0, 120) + "..."
                : String(contentStr),
            module: "messages",
            icon: "message-square",
            href: `/app/messenger?chat=${m.chatId}`,
            timestamp: m.createdAt,
          };
        });
      }

      // Search documents
      if (category === "all" || category === "docs") {
        const docResults = await db
          .select({
            id: documents.id,
            title: documents.title,
            type: documents.type,
            updatedAt: documents.updatedAt,
          })
          .from(documents)
          .where(
            and(
              eq(documents.orgId, orgId),
              isNull(documents.deletedAt),
              ilike(documents.title, searchTerm)
            )
          )
          .orderBy(desc(documents.updatedAt))
          .limit(limit);

        results.docs = docResults.map((d) => ({
          id: d.id,
          title: d.title,
          snippet: d.type,
          module: "docs",
          icon: "file-text",
          href: `/app/docs/${d.id}`,
          timestamp: d.updatedAt,
        }));
      }

      // Search calendar events
      if (category === "all" || category === "events") {
        const eventResults = await db
          .select({
            id: calendarEvents.id,
            title: calendarEvents.title,
            description: calendarEvents.description,
            startTime: calendarEvents.startTime,
            location: calendarEvents.location,
          })
          .from(calendarEvents)
          .leftJoin(
            eventAttendees,
            and(
              eq(eventAttendees.eventId, calendarEvents.id),
              eq(eventAttendees.userId, userId)
            )
          )
          .where(
            and(
              eq(calendarEvents.orgId, orgId),
              isNull(calendarEvents.deletedAt),
              or(
                eq(calendarEvents.creatorId, userId),
                sql`${eventAttendees.userId} IS NOT NULL`
              ),
              or(
                ilike(calendarEvents.title, searchTerm),
                ilike(calendarEvents.description, searchTerm)
              )
            )
          )
          .orderBy(desc(calendarEvents.startTime))
          .limit(limit);

        results.events = eventResults.map((e) => ({
          id: e.id,
          title: e.title,
          snippet: e.location || e.description?.substring(0, 100) || "",
          module: "events",
          icon: "calendar",
          href: `/app/calendar`,
          timestamp: e.startTime,
        }));
      }

      // Search tasks (assigned to user or created by user)
      if (category === "all" || category === "tasks") {
        const taskResults = await db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            dueDate: tasks.dueDate,
            updatedAt: tasks.updatedAt,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.orgId, orgId),
              or(
                eq(tasks.creatorId, userId),
                sql`${userId} = ANY(${tasks.assigneeIds})`
              ),
              or(
                ilike(tasks.title, searchTerm),
                ilike(tasks.description, searchTerm)
              )
            )
          )
          .orderBy(desc(tasks.updatedAt))
          .limit(limit);

        results.tasks = taskResults.map((t) => ({
          id: t.id,
          title: t.title,
          snippet: `${t.status} | ${t.priority}`,
          module: "tasks",
          icon: "check-square",
          href: `/app/tasks`,
          timestamp: t.updatedAt,
        }));
      }

      // Search emails (user's mailboxes only)
      if (category === "all" || category === "email") {
        const userMailboxes = await db
          .select({ id: mailboxes.id })
          .from(mailboxes)
          .where(
            and(eq(mailboxes.orgId, orgId), eq(mailboxes.userId, userId))
          );

        if (userMailboxes.length > 0) {
          const mailboxIds = userMailboxes.map((mb) => mb.id);
          const emailResults = await db
            .select({
              id: emailMessages.id,
              subject: emailMessages.subject,
              fromAddress: emailMessages.fromAddress,
              bodyText: emailMessages.bodyText,
              folder: emailMessages.folder,
              receivedAt: emailMessages.receivedAt,
              sentAt: emailMessages.sentAt,
            })
            .from(emailMessages)
            .where(
              and(
                eq(emailMessages.orgId, orgId),
                sql`${emailMessages.mailboxId} IN (${sql.join(
                  mailboxIds.map((id) => sql`${id}`),
                  sql`, `
                )})`,
                or(
                  ilike(emailMessages.subject, searchTerm),
                  ilike(emailMessages.fromAddress, searchTerm),
                  ilike(emailMessages.bodyText, searchTerm)
                )
              )
            )
            .orderBy(desc(emailMessages.createdAt))
            .limit(limit);

          results.email = emailResults.map((e) => ({
            id: e.id,
            title: e.subject || "(No subject)",
            snippet: e.fromAddress,
            module: "email",
            icon: "mail",
            href: `/app/email`,
            timestamp: e.receivedAt || e.sentAt,
          }));
        } else {
          results.email = [];
        }
      }

      return reply.status(200).send({ results, query: q });
    }
  );
}
