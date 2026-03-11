import { z } from "zod";

// Document types
export const documentTypeSchema = z.enum([
  "doc",
  "sheet",
  "slide",
  "mindnote",
  "board",
]);

// Permission roles
export const permissionRoleSchema = z.enum([
  "viewer",
  "editor",
  "manager",
  "owner",
]);

// Principal types
export const principalTypeSchema = z.enum(["user", "department", "org"]);

// Create document schema
export const createDocumentSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title must be at most 500 characters")
    .optional()
    .default("Untitled"),
  type: documentTypeSchema.optional().default("doc"),
  templateId: z.string().uuid().optional(),
});

// Update document schema
export const updateDocumentSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title must be at most 500 characters")
    .optional(),
  settingsJson: z.record(z.unknown()).optional(),
});

// Document permission schema
export const addPermissionSchema = z.object({
  principalId: z.string().uuid(),
  principalType: principalTypeSchema,
  role: permissionRoleSchema,
});

export const updatePermissionSchema = z.object({
  role: permissionRoleSchema,
});

// Document version schema
export const createVersionSchema = z.object({
  name: z.string().max(255).optional(),
});

// Document comment schema
export const createCommentSchema = z.object({
  content: z.string().min(1, "Comment content is required"),
  blockId: z.string().max(255).optional(),
  anchorJson: z.record(z.unknown()).optional(),
  threadId: z.string().uuid().optional(), // For replies
});

export const updateCommentSchema = z.object({
  content: z.string().min(1, "Comment content is required"),
});

// Query schema for document list
export const documentsQuerySchema = z.object({
  type: documentTypeSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const num = parseInt(val ?? "20", 10);
      return isNaN(num) ? 20 : Math.min(Math.max(num, 1), 100);
    }),
});

// Type exports
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type AddPermissionInput = z.infer<typeof addPermissionSchema>;
export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type DocumentsQueryInput = z.infer<typeof documentsQuerySchema>;
