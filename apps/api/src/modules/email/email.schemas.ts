import { z } from "zod";

// ============ SEND EMAIL ============

export const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(998),
  body_html: z.string().min(1),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        size: z.number().int().positive(),
        mimeType: z.string(),
      })
    )
    .optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;

// ============ LIST MESSAGES ============

export const listMessagesQuerySchema = z.object({
  folder: z
    .enum(["inbox", "sent", "drafts", "trash", "archive", "spam"])
    .optional()
    .default("inbox"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

// ============ UPDATE MESSAGE ============

export const updateMessageSchema = z.object({
  isRead: z.boolean().optional(),
  isFlagged: z.boolean().optional(),
  folder: z
    .enum(["inbox", "sent", "drafts", "trash", "archive", "spam"])
    .optional(),
});

export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
