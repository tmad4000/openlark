import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, index, boolean, customType, AnyPgColumn } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { departments } from "./departments";

// Custom type for bytea (binary data)
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

// Document type enum
export const documentTypeEnum = pgEnum("document_type", ["doc", "sheet", "slide", "mindnote", "board"]);

// Document permission principal type enum
export const documentPrincipalTypeEnum = pgEnum("document_principal_type", ["user", "department", "org"]);

// Document permission role enum
export const documentRoleEnum = pgEnum("document_role", ["viewer", "editor", "manager", "owner"]);

// Documents table
export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  type: documentTypeEnum("type").notNull(),
  yjsDocId: varchar("yjs_doc_id", { length: 255 }).unique(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: uuid("template_id"),
  settings: jsonb("settings").$type<{
    defaultFont?: string;
    defaultFontSize?: number;
    pageSize?: "A4" | "Letter" | "Legal";
    orientation?: "portrait" | "landscape";
    theme?: "light" | "dark" | "system";
  }>(),
  yjsState: bytea("yjs_state"), // Yjs binary state for real-time collaboration
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("documents_org_id_idx").on(table.orgId),
  index("documents_owner_id_idx").on(table.ownerId),
  index("documents_type_idx").on(table.type),
  index("documents_yjs_doc_id_idx").on(table.yjsDocId),
  index("documents_template_id_idx").on(table.templateId),
  index("documents_deleted_at_idx").on(table.deletedAt),
]);

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// Document permissions table
export const documentPermissions = pgTable("document_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  principalId: uuid("principal_id").notNull(), // user_id, department_id, or org_id
  principalType: documentPrincipalTypeEnum("principal_type").notNull(),
  role: documentRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("document_permissions_document_id_idx").on(table.documentId),
  index("document_permissions_principal_id_idx").on(table.principalId),
  index("document_permissions_principal_type_idx").on(table.principalType),
]);

export type DocumentPermission = typeof documentPermissions.$inferSelect;
export type InsertDocumentPermission = typeof documentPermissions.$inferInsert;

// Document versions table
export const documentVersions = pgTable("document_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  snapshotBlob: bytea("snapshot_blob"),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("document_versions_document_id_idx").on(table.documentId),
  index("document_versions_created_by_idx").on(table.createdBy),
  index("document_versions_created_at_idx").on(table.createdAt),
]);

export type DocumentVersion = typeof documentVersions.$inferSelect;
export type InsertDocumentVersion = typeof documentVersions.$inferInsert;

// Document comments table
export const documentComments = pgTable("document_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  blockId: varchar("block_id", { length: 255 }), // reference to a specific block in the document
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  threadId: uuid("thread_id").references((): AnyPgColumn => documentComments.id, { onDelete: "cascade" }), // self-reference for comment threads
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("document_comments_document_id_idx").on(table.documentId),
  index("document_comments_block_id_idx").on(table.blockId),
  index("document_comments_user_id_idx").on(table.userId),
  index("document_comments_thread_id_idx").on(table.threadId),
  index("document_comments_resolved_idx").on(table.resolved),
]);

export type DocumentComment = typeof documentComments.$inferSelect;
export type InsertDocumentComment = typeof documentComments.$inferInsert;
