import { db } from "../../db/index.js";
import { emailMessages, mailboxes } from "../../db/schema/index.js";
import { eq, and, desc } from "drizzle-orm";
import type {
  SendEmailInput,
  ListMessagesQuery,
  UpdateMessageInput,
} from "./email.schemas.js";

export class EmailService {
  // ============ SEND ============

  async sendEmail(input: SendEmailInput, userId: string, orgId: string) {
    // Get user's primary mailbox (or first mailbox)
    const [mailbox] = await db
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, userId), eq(mailboxes.orgId, orgId)))
      .orderBy(desc(mailboxes.isPrimary))
      .limit(1);

    if (!mailbox) {
      return {
        error: "NO_MAILBOX" as const,
        message: "User does not have a mailbox configured",
      };
    }

    const now = new Date();

    const [message] = await db
      .insert(emailMessages)
      .values({
        orgId,
        mailboxId: mailbox.id,
        fromAddress: mailbox.address,
        toAddresses: input.to,
        ccAddresses: input.cc ?? null,
        subject: input.subject,
        bodyHtml: input.body_html,
        attachments: input.attachments ?? null,
        folder: "sent",
        status: "sent",
        isRead: true,
        sentAt: now,
      })
      .returning();

    if (!message) throw new Error("Failed to create email message");

    // V1: We'd call a transactional email API (Postmark/SendGrid) here.
    // For now, we just mark as sent.

    return { message };
  }

  // ============ LIST MESSAGES ============

  async listMessages(
    userId: string,
    orgId: string,
    query: ListMessagesQuery
  ) {
    // Get user's mailbox ids
    const userMailboxes = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, userId), eq(mailboxes.orgId, orgId)));

    if (userMailboxes.length === 0) {
      return [];
    }

    const mailboxIds = userMailboxes.map((m) => m.id);

    // For simplicity with single mailbox (most common), use eq
    // For multiple mailboxes, we'd use inArray
    const { inArray } = await import("drizzle-orm");

    return db
      .select({
        id: emailMessages.id,
        fromAddress: emailMessages.fromAddress,
        toAddresses: emailMessages.toAddresses,
        ccAddresses: emailMessages.ccAddresses,
        subject: emailMessages.subject,
        folder: emailMessages.folder,
        status: emailMessages.status,
        isRead: emailMessages.isRead,
        isFlagged: emailMessages.isFlagged,
        sentAt: emailMessages.sentAt,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .where(
        and(
          inArray(emailMessages.mailboxId, mailboxIds),
          eq(emailMessages.folder, query.folder)
        )
      )
      .orderBy(desc(emailMessages.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  // ============ GET MESSAGE ============

  async getMessage(messageId: string, userId: string, orgId: string) {
    const userMailboxes = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(and(eq(mailboxes.userId, userId), eq(mailboxes.orgId, orgId)));

    if (userMailboxes.length === 0) return null;

    const mailboxIds = userMailboxes.map((m) => m.id);
    const { inArray } = await import("drizzle-orm");

    const [message] = await db
      .select()
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.id, messageId),
          inArray(emailMessages.mailboxId, mailboxIds)
        )
      );

    return message ?? null;
  }

  // ============ UPDATE MESSAGE ============

  async updateMessage(
    messageId: string,
    input: UpdateMessageInput,
    userId: string,
    orgId: string
  ) {
    // Verify ownership
    const existing = await this.getMessage(messageId, userId, orgId);
    if (!existing) return null;

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.isRead !== undefined) updates.isRead = input.isRead;
    if (input.isFlagged !== undefined) updates.isFlagged = input.isFlagged;
    if (input.folder !== undefined) updates.folder = input.folder;

    const [updated] = await db
      .update(emailMessages)
      .set(updates)
      .where(eq(emailMessages.id, messageId))
      .returning();

    return updated ?? null;
  }

  // ============ DELETE MESSAGE (move to trash) ============

  async deleteMessage(messageId: string, userId: string, orgId: string) {
    const existing = await this.getMessage(messageId, userId, orgId);
    if (!existing) return null;

    // If already in trash, hard-delete
    if (existing.folder === "trash") {
      await db
        .delete(emailMessages)
        .where(eq(emailMessages.id, messageId));
      return { deleted: true };
    }

    // Otherwise move to trash
    const [updated] = await db
      .update(emailMessages)
      .set({ folder: "trash", updatedAt: new Date() })
      .where(eq(emailMessages.id, messageId))
      .returning();

    return updated ?? null;
  }
}

export const emailService = new EmailService();
