import { db } from "../../db/index.js";
import { messages, chats, chatMembers } from "../../db/schema/messenger.js";
import { documents } from "../../db/schema/docs.js";
import { calendarEvents, eventAttendees } from "../../db/schema/calendar.js";
import { users } from "../../db/schema/auth.js";
import { tasks } from "../../db/schema/tasks.js";
import { emailMessages, mailboxes } from "../../db/schema/email.js";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";

export interface SearchResult {
  id: string;
  type: "message" | "document" | "event" | "contact" | "task" | "email";
  title: string;
  snippet: string;
  sourceModule: string;
  sourceId?: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

interface SearchParams {
  query: string;
  category?: string;
  limit?: number;
  userId: string;
  orgId: string;
}

class SearchService {
  async search(params: SearchParams): Promise<{ results: SearchResult[] }> {
    const { query, category, limit = 20, userId, orgId } = params;
    const perCategory = Math.min(limit, 10);

    if (!query.trim()) {
      return { results: [] };
    }

    const pattern = `%${query}%`;
    const categories = category && category !== "all" ? [category] : [
      "messages", "docs", "events", "contacts", "tasks", "email",
    ];

    const promises: Promise<SearchResult[]>[] = [];

    if (categories.includes("messages")) {
      promises.push(this.searchMessages(pattern, userId, orgId, perCategory));
    }
    if (categories.includes("docs")) {
      promises.push(this.searchDocuments(pattern, userId, orgId, perCategory));
    }
    if (categories.includes("events")) {
      promises.push(this.searchEvents(pattern, userId, orgId, perCategory));
    }
    if (categories.includes("contacts")) {
      promises.push(this.searchContacts(pattern, orgId, perCategory));
    }
    if (categories.includes("tasks")) {
      promises.push(this.searchTasks(pattern, userId, orgId, perCategory));
    }
    if (categories.includes("email")) {
      promises.push(this.searchEmail(pattern, userId, orgId, perCategory));
    }

    const allResults = (await Promise.all(promises)).flat();
    // Sort by timestamp descending
    allResults.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return { results: allResults.slice(0, limit) };
  }

  private async searchMessages(
    pattern: string,
    userId: string,
    orgId: string,
    limit: number
  ): Promise<SearchResult[]> {
    // Only search in chats the user is a member of
    const rows = await db
      .select({
        id: messages.id,
        chatId: messages.chatId,
        chatName: chats.name,
        contentJson: messages.contentJson,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .innerJoin(
        chatMembers,
        and(eq(chatMembers.chatId, chats.id), eq(chatMembers.userId, userId))
      )
      .where(
        and(
          eq(chats.orgId, orgId),
          sql`${messages.contentJson}::text ILIKE ${pattern}`
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return rows.map((row) => {
      const content = row.contentJson as { text?: string } | null;
      const text = content?.text || JSON.stringify(content).slice(0, 100);
      return {
        id: row.id,
        type: "message" as const,
        title: row.chatName || "Direct Message",
        snippet: text.slice(0, 150),
        sourceModule: "Messenger",
        sourceId: row.chatId,
        timestamp: row.createdAt.toISOString(),
      };
    });
  }

  private async searchDocuments(
    pattern: string,
    _userId: string,
    orgId: string,
    limit: number
  ): Promise<SearchResult[]> {
    // Search documents within the org (permission filtering is done at the org level)
    const rows = await db
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
          ilike(documents.title, pattern)
        )
      )
      .orderBy(desc(documents.updatedAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      type: "document" as const,
      title: row.title,
      snippet: `${row.type === "doc" ? "Document" : "Sheet"}`,
      sourceModule: "Docs",
      timestamp: row.updatedAt.toISOString(),
    }));
  }

  private async searchEvents(
    pattern: string,
    userId: string,
    orgId: string,
    limit: number
  ): Promise<SearchResult[]> {
    const rows = await db
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
          or(
            ilike(calendarEvents.title, pattern),
            ilike(calendarEvents.description, pattern)
          ),
          or(
            eq(calendarEvents.creatorId, userId),
            sql`${eventAttendees.id} IS NOT NULL`
          )
        )
      )
      .orderBy(desc(calendarEvents.startTime))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      type: "event" as const,
      title: row.title,
      snippet: row.location || row.description?.slice(0, 100) || "",
      sourceModule: "Calendar",
      timestamp: row.startTime.toISOString(),
    }));
  }

  private async searchContacts(
    pattern: string,
    orgId: string,
    limit: number
  ): Promise<SearchResult[]> {
    const rows = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(
        and(
          eq(users.orgId, orgId),
          or(
            ilike(users.displayName, pattern),
            ilike(users.email, pattern)
          )
        )
      )
      .orderBy(desc(users.updatedAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      type: "contact" as const,
      title: row.displayName || row.email,
      snippet: row.email,
      sourceModule: "Contacts",
      timestamp: row.updatedAt.toISOString(),
      meta: { avatarUrl: row.avatarUrl },
    }));
  }

  private async searchTasks(
    pattern: string,
    userId: string,
    orgId: string,
    limit: number
  ): Promise<SearchResult[]> {
    const rows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.orgId, orgId),
          or(
            ilike(tasks.title, pattern),
            ilike(tasks.description, pattern)
          )
        )
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      type: "task" as const,
      title: row.title,
      snippet: row.description?.slice(0, 100) || `Status: ${row.status}`,
      sourceModule: "Tasks",
      timestamp: row.updatedAt.toISOString(),
      meta: { status: row.status },
    }));
  }

  private async searchEmail(
    pattern: string,
    userId: string,
    orgId: string,
    limit: number
  ): Promise<SearchResult[]> {
    const rows = await db
      .select({
        id: emailMessages.id,
        subject: emailMessages.subject,
        fromAddress: emailMessages.fromAddress,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .innerJoin(mailboxes, eq(emailMessages.mailboxId, mailboxes.id))
      .where(
        and(
          eq(emailMessages.orgId, orgId),
          eq(mailboxes.userId, userId),
          or(
            ilike(emailMessages.subject, pattern),
            ilike(emailMessages.fromAddress, pattern)
          )
        )
      )
      .orderBy(desc(emailMessages.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      type: "email" as const,
      title: row.subject,
      snippet: `From: ${row.fromAddress}`,
      sourceModule: "Email",
      timestamp: row.createdAt.toISOString(),
    }));
  }
}

export const searchService = new SearchService();
