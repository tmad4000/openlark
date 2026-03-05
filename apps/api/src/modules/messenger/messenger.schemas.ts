import { z } from "zod";

// Chat types
export const chatTypes = ["dm", "group", "topic_group", "supergroup", "meeting"] as const;
export type ChatType = (typeof chatTypes)[number];

// Chat member roles
export const chatMemberRoles = ["owner", "admin", "member"] as const;
export type ChatMemberRole = (typeof chatMemberRoles)[number];

// Message types
export const messageTypes = ["text", "rich_text", "code", "voice", "card", "system"] as const;
export type MessageType = (typeof messageTypes)[number];

// Create chat schema
export const createChatSchema = z.object({
  type: z.enum(chatTypes).default("group"),
  name: z.string().max(255).optional(),
  avatarUrl: z.string().url().optional(),
  isPublic: z.boolean().default(false),
  maxMembers: z.number().int().positive().max(50000).optional(),
  memberIds: z.array(z.string().uuid()).min(1).max(100), // Initial members (for DMs must be exactly 1)
}).refine(
  (data) => {
    // DMs must have exactly 1 other member
    if (data.type === "dm" && data.memberIds.length !== 1) {
      return false;
    }
    return true;
  },
  { message: "DM chats must have exactly one other member" }
);

export type CreateChatInput = z.infer<typeof createChatSchema>;

// Update chat schema
export const updateChatSchema = z.object({
  name: z.string().max(255).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean().optional(),
  maxMembers: z.number().int().positive().max(50000).nullable().optional(),
});

export type UpdateChatInput = z.infer<typeof updateChatSchema>;

// Add member schema
export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(chatMemberRoles).default("member"),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

// Update member schema
export const updateMemberSchema = z.object({
  role: z.enum(chatMemberRoles).optional(),
  muted: z.boolean().optional(),
  label: z.string().max(100).nullable().optional(),
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

// Send message schema
export const sendMessageSchema = z.object({
  type: z.enum(messageTypes).default("text"),
  content: z.union([
    z.string().min(1).max(10000), // Plain text
    z.object({}).passthrough(), // Rich content JSON
  ]),
  threadId: z.string().uuid().optional(),
  replyToId: z.string().uuid().optional(),
  scheduledFor: z.string().datetime().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// Edit message schema
export const editMessageSchema = z.object({
  content: z.union([
    z.string().min(1).max(10000),
    z.object({}).passthrough(),
  ]),
});

export type EditMessageInput = z.infer<typeof editMessageSchema>;

// Reaction schema
export const reactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

export type ReactionInput = z.infer<typeof reactionSchema>;

// Pagination schema
export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  before: z.string().uuid().optional(), // Cursor for messages before this ID
  after: z.string().uuid().optional(), // Cursor for messages after this ID
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// Pin message schema
export const pinMessageSchema = z.object({
  messageId: z.string().uuid(),
});

export type PinMessageInput = z.infer<typeof pinMessageSchema>;
