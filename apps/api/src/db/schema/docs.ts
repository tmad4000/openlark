import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users, organizations } from "./auth";

// Custom type for Yjs binary data (Uint8Array stored as bytea)
const bytea = customType<{
  data: Uint8Array;
  driverData: Buffer;
}>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
  fromDriver(value: Buffer): Uint8Array {
    return new Uint8Array(value);
  },
});

// Enums
export const documentTypeEnum = pgEnum("document_type", [
  "doc",
  "sheet",
  "slide",
  "mindnote",
  "board",
]);

export const documentPermissionRoleEnum = pgEnum("document_permission_role", [
  "viewer",
  "editor",
  "manager",
  "owner",
]);

export const principalTypeEnum = pgEnum("principal_type", [
  "user",
  "department",
  "org",
]);

// Documents table - core entity for all document types
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    title: varchar("title", { length: 500 }).notNull().default("Untitled"),
    type: documentTypeEnum("type").notNull().default("doc"),
    // Yjs binary state - stored for quick loading
    yjsState: bytea("yjs_state"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    templateId: uuid("template_id"), // Self-reference for templates
    settingsJson: jsonb("settings_json").default({}),
    // Metadata
    wordCount: varchar("word_count", { length: 20 }).default("0"),
    lastEditedBy: uuid("last_edited_by").references(() => users.id),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("documents_org_id_idx").on(table.orgId),
    index("documents_owner_id_idx").on(table.ownerId),
    index("documents_type_idx").on(table.type),
    index("documents_created_at_idx").on(table.createdAt),
  ]
);

// Document permissions - who can access and at what level
export const documentPermissions = pgTable(
  "document_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    principalId: uuid("principal_id").notNull(), // User ID, Department ID, or Org ID
    principalType: principalTypeEnum("principal_type").notNull(),
    role: documentPermissionRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index("document_permissions_document_id_idx").on(table.documentId),
    uniqueIndex("document_permissions_unique_idx")
      .on(table.documentId, table.principalId, table.principalType)
      .where(sql`true`),
  ]
);

// Document versions - named snapshots for version management
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }),
    // Yjs snapshot binary
    snapshotBlob: bytea("snapshot_blob").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("document_versions_document_id_idx").on(table.documentId),
    index("document_versions_created_at_idx").on(table.createdAt),
  ]
);

// Document comments - anchored to text selections or block IDs
export const documentComments = pgTable(
  "document_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Block or text anchor (can be block ID or selection range)
    blockId: varchar("block_id", { length: 255 }),
    anchorJson: jsonb("anchor_json"), // For text selection anchoring
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    resolved: timestamp("resolved", { withTimezone: true }),
    threadId: uuid("thread_id"), // For threaded replies (self-reference)
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("document_comments_document_id_idx").on(table.documentId),
    index("document_comments_user_id_idx").on(table.userId),
    index("document_comments_thread_id_idx").on(table.threadId),
  ]
);

// Yjs updates table - for incremental updates (used by Hocuspocus)
// This stores individual Yjs updates that can be merged into the main state
export const yjsUpdates = pgTable(
  "yjs_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    updateData: bytea("update_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("yjs_updates_document_id_idx").on(table.documentId),
    index("yjs_updates_created_at_idx").on(table.createdAt),
  ]
);

// Relations
export const documentsRelations = relations(documents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documents.orgId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [documents.ownerId],
    references: [users.id],
    relationName: "documentOwner",
  }),
  lastEditor: one(users, {
    fields: [documents.lastEditedBy],
    references: [users.id],
    relationName: "documentLastEditor",
  }),
  template: one(documents, {
    fields: [documents.templateId],
    references: [documents.id],
  }),
  permissions: many(documentPermissions),
  versions: many(documentVersions),
  comments: many(documentComments),
  yjsUpdates: many(yjsUpdates),
}));

export const documentPermissionsRelations = relations(
  documentPermissions,
  ({ one }) => ({
    document: one(documents, {
      fields: [documentPermissions.documentId],
      references: [documents.id],
    }),
    createdByUser: one(users, {
      fields: [documentPermissions.createdBy],
      references: [users.id],
    }),
  })
);

export const documentVersionsRelations = relations(
  documentVersions,
  ({ one }) => ({
    document: one(documents, {
      fields: [documentVersions.documentId],
      references: [documents.id],
    }),
    createdByUser: one(users, {
      fields: [documentVersions.createdBy],
      references: [users.id],
    }),
  })
);

export const documentCommentsRelations = relations(
  documentComments,
  ({ one, many }) => ({
    document: one(documents, {
      fields: [documentComments.documentId],
      references: [documents.id],
    }),
    user: one(users, {
      fields: [documentComments.userId],
      references: [users.id],
    }),
    parentThread: one(documentComments, {
      fields: [documentComments.threadId],
      references: [documentComments.id],
      relationName: "commentReplies",
    }),
    replies: many(documentComments, {
      relationName: "commentReplies",
    }),
  })
);

export const yjsUpdatesRelations = relations(yjsUpdates, ({ one }) => ({
  document: one(documents, {
    fields: [yjsUpdates.documentId],
    references: [documents.id],
  }),
}));

// Type exports
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentPermission = typeof documentPermissions.$inferSelect;
export type NewDocumentPermission = typeof documentPermissions.$inferInsert;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;
export type DocumentComment = typeof documentComments.$inferSelect;
export type NewDocumentComment = typeof documentComments.$inferInsert;
export type YjsUpdate = typeof yjsUpdates.$inferSelect;
export type NewYjsUpdate = typeof yjsUpdates.$inferInsert;
