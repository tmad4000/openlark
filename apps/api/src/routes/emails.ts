import { FastifyInstance } from "fastify";
import { db } from "../db";
import {
  emailMessages,
  mailboxes,
} from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Interfaces ---

interface SendEmailBody {
  to: string[];
  cc?: string[];
  subject: string;
  body_html: string;
  attachments?: Array<{
    name: string;
    url: string;
    size: number;
    mimeType: string;
  }>;
}

interface ListEmailsQuery {
  folder?: string;
  page?: string;
  limit?: string;
}

interface PatchEmailBody {
  is_read?: boolean;
  is_flagged?: boolean;
  folder?: string;
}

const VALID_FOLDERS = ["inbox", "sent", "drafts", "trash", "spam", "archive"] as const;

async function getOrCreateMailbox(userId: string, orgId: string) {
  const [existing] = await db
    .select()
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.userId, userId),
        eq(mailboxes.orgId, orgId),
        eq(mailboxes.isPrimary, true)
      )
    )
    .limit(1);

  if (existing) return existing;

  // Auto-create a primary mailbox for the user
  const [created] = await db
    .insert(mailboxes)
    .values({
      orgId,
      userId,
      emailAddress: `user-${userId.slice(0, 8)}@openlark.local`,
      isPrimary: true,
    })
    .returning();

  return created;
}

export async function emailRoutes(fastify: FastifyInstance) {
  // ========================
  // Send Email
  // ========================

  // POST /email/send - Send an email
  fastify.post<{ Body: SendEmailBody }>(
    "/email/send",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { to, cc, subject, body_html, attachments } = request.body || {};

      if (!to || !Array.isArray(to) || to.length === 0) {
        return reply.status(400).send({ error: "to is required and must be a non-empty array of email addresses" });
      }

      for (const addr of to) {
        if (typeof addr !== "string" || !addr.includes("@")) {
          return reply.status(400).send({ error: `Invalid email address: ${addr}` });
        }
      }

      if (cc) {
        if (!Array.isArray(cc)) {
          return reply.status(400).send({ error: "cc must be an array of email addresses" });
        }
        for (const addr of cc) {
          if (typeof addr !== "string" || !addr.includes("@")) {
            return reply.status(400).send({ error: `Invalid cc email address: ${addr}` });
          }
        }
      }

      if (!subject || typeof subject !== "string") {
        return reply.status(400).send({ error: "subject is required" });
      }

      if (!body_html || typeof body_html !== "string") {
        return reply.status(400).send({ error: "body_html is required" });
      }

      const mailbox = await getOrCreateMailbox(user.id, user.orgId!);

      // Create the email message in sent folder
      const [email] = await db
        .insert(emailMessages)
        .values({
          orgId: user.orgId!,
          mailboxId: mailbox.id,
          fromAddress: mailbox.emailAddress,
          toAddresses: to,
          ccAddresses: cc || null,
          subject: subject.trim(),
          bodyHtml: body_html,
          bodyText: body_html.replace(/<[^>]*>/g, ""), // basic strip
          folder: "sent",
          status: "sent",
          isRead: true,
          attachments: attachments || null,
          sentAt: new Date(),
        })
        .returning();

      // In V1, we record the email but don't actually send via SMTP.
      // A real integration would queue this for Postmark/SendGrid here.

      return reply.status(201).send({ email });
    }
  );

  // ========================
  // List Emails
  // ========================

  // GET /email/messages?folder=inbox&page=1&limit=50
  fastify.get<{ Querystring: ListEmailsQuery }>(
    "/email/messages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { folder = "inbox", page = "1", limit = "50" } = request.query;

      if (!VALID_FOLDERS.includes(folder as typeof VALID_FOLDERS[number])) {
        return reply.status(400).send({ error: `Invalid folder. Must be one of: ${VALID_FOLDERS.join(", ")}` });
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const mailbox = await getOrCreateMailbox(user.id, user.orgId!);

      const messages = await db
        .select()
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.mailboxId, mailbox.id),
            eq(emailMessages.folder, folder as typeof VALID_FOLDERS[number])
          )
        )
        .orderBy(desc(emailMessages.createdAt))
        .limit(limitNum)
        .offset(offset);

      // Get total count for pagination
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.mailboxId, mailbox.id),
            eq(emailMessages.folder, folder as typeof VALID_FOLDERS[number])
          )
        );

      return reply.send({
        messages,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult?.count || 0,
          totalPages: Math.ceil((countResult?.count || 0) / limitNum),
        },
      });
    }
  );

  // ========================
  // Get Single Email
  // ========================

  // GET /email/messages/:id - Get full email with body
  fastify.get<{ Params: { id: string } }>(
    "/email/messages/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid email ID" });
      }

      const mailbox = await getOrCreateMailbox(user.id, user.orgId!);

      const [email] = await db
        .select()
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.id, id),
            eq(emailMessages.mailboxId, mailbox.id)
          )
        )
        .limit(1);

      if (!email) {
        return reply.status(404).send({ error: "Email not found" });
      }

      return reply.send({ email });
    }
  );

  // ========================
  // Update Email
  // ========================

  // PATCH /email/messages/:id - Mark read, flag, move folder
  fastify.patch<{ Params: { id: string }; Body: PatchEmailBody }>(
    "/email/messages/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;
      const { is_read, is_flagged, folder } = request.body || {};

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid email ID" });
      }

      const mailbox = await getOrCreateMailbox(user.id, user.orgId!);

      const [existing] = await db
        .select()
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.id, id),
            eq(emailMessages.mailboxId, mailbox.id)
          )
        )
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Email not found" });
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (typeof is_read === "boolean") {
        updates.isRead = is_read;
      }

      if (typeof is_flagged === "boolean") {
        updates.isFlagged = is_flagged;
      }

      if (folder !== undefined) {
        if (!VALID_FOLDERS.includes(folder as typeof VALID_FOLDERS[number])) {
          return reply.status(400).send({ error: `Invalid folder. Must be one of: ${VALID_FOLDERS.join(", ")}` });
        }
        updates.folder = folder;
      }

      const [updated] = await db
        .update(emailMessages)
        .set(updates)
        .where(eq(emailMessages.id, id))
        .returning();

      return reply.send({ email: updated });
    }
  );

  // ========================
  // Delete Email (move to trash)
  // ========================

  // DELETE /email/messages/:id - Move to trash (or permanently delete if already in trash)
  fastify.delete<{ Params: { id: string } }>(
    "/email/messages/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid email ID" });
      }

      const mailbox = await getOrCreateMailbox(user.id, user.orgId!);

      const [existing] = await db
        .select()
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.id, id),
            eq(emailMessages.mailboxId, mailbox.id)
          )
        )
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Email not found" });
      }

      if (existing.folder === "trash") {
        // Permanently delete if already in trash
        await db
          .delete(emailMessages)
          .where(eq(emailMessages.id, id));
      } else {
        // Move to trash
        await db
          .update(emailMessages)
          .set({ folder: "trash", updatedAt: new Date() })
          .where(eq(emailMessages.id, id));
      }

      return reply.status(204).send();
    }
  );
}
