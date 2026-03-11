import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, index, integer, AnyPgColumn } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { documents } from "./documents";

// Wiki space type enum
export const wikiSpaceTypeEnum = pgEnum("wiki_space_type", ["private", "public"]);

// Wiki space member role enum
export const wikiSpaceMemberRoleEnum = pgEnum("wiki_space_member_role", ["admin", "editor", "viewer"]);

// Wiki spaces table
export const wikiSpaces = pgTable("wiki_spaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }), // emoji or icon name
  type: wikiSpaceTypeEnum("type").notNull().default("private"),
  settings: jsonb("settings").$type<{
    allowPublicComments?: boolean;
    defaultPagePermission?: "view" | "edit";
    customBranding?: {
      primaryColor?: string;
      logoUrl?: string;
    };
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wiki_spaces_org_id_idx").on(table.orgId),
  index("wiki_spaces_type_idx").on(table.type),
]);

export type WikiSpace = typeof wikiSpaces.$inferSelect;
export type InsertWikiSpace = typeof wikiSpaces.$inferInsert;

// Wiki space members table
export const wikiSpaceMembers = pgTable("wiki_space_members", {
  spaceId: uuid("space_id").notNull().references(() => wikiSpaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: wikiSpaceMemberRoleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wiki_space_members_space_id_idx").on(table.spaceId),
  index("wiki_space_members_user_id_idx").on(table.userId),
]);

export type WikiSpaceMember = typeof wikiSpaceMembers.$inferSelect;
export type InsertWikiSpaceMember = typeof wikiSpaceMembers.$inferInsert;

// Wiki pages table
export const wikiPages = pgTable("wiki_pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  spaceId: uuid("space_id").notNull().references(() => wikiSpaces.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  parentPageId: uuid("parent_page_id").references((): AnyPgColumn => wikiPages.id, { onDelete: "set null" }), // self-reference for page hierarchy
  position: integer("position").notNull().default(0), // ordering within same parent
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wiki_pages_space_id_idx").on(table.spaceId),
  index("wiki_pages_document_id_idx").on(table.documentId),
  index("wiki_pages_parent_page_id_idx").on(table.parentPageId),
  index("wiki_pages_position_idx").on(table.position),
  index("wiki_pages_created_by_idx").on(table.createdBy),
]);

export type WikiPage = typeof wikiPages.$inferSelect;
export type InsertWikiPage = typeof wikiPages.$inferInsert;
