import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, organizations } from "./auth";
import { documents } from "./docs";

// Enums
export const wikiSpaceTypeEnum = pgEnum("wiki_space_type", [
  "private",
  "public",
]);

export const wikiSpaceMemberRoleEnum = pgEnum("wiki_space_member_role", [
  "admin",
  "editor",
  "viewer",
]);

// Wiki spaces table
export const wikiSpaces = pgTable(
  "wiki_spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 100 }),
    type: wikiSpaceTypeEnum("type").notNull().default("private"),
    settingsJson: jsonb("settings_json").default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("wiki_spaces_org_id_idx").on(table.orgId),
    index("wiki_spaces_created_by_idx").on(table.createdBy),
  ]
);

// Wiki space members table
export const wikiSpaceMembers = pgTable(
  "wiki_space_members",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: wikiSpaceMemberRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wiki_space_members_space_id_idx").on(table.spaceId),
    index("wiki_space_members_user_id_idx").on(table.userId),
  ]
);

// Wiki pages table
export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => wikiSpaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    parentPageId: uuid("parent_page_id"), // Self-reference for tree structure
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("wiki_pages_space_id_idx").on(table.spaceId),
    index("wiki_pages_document_id_idx").on(table.documentId),
    index("wiki_pages_parent_page_id_idx").on(table.parentPageId),
  ]
);

// Relations
export const wikiSpacesRelations = relations(wikiSpaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [wikiSpaces.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [wikiSpaces.createdBy],
    references: [users.id],
  }),
  members: many(wikiSpaceMembers),
  pages: many(wikiPages),
}));

export const wikiSpaceMembersRelations = relations(
  wikiSpaceMembers,
  ({ one }) => ({
    space: one(wikiSpaces, {
      fields: [wikiSpaceMembers.spaceId],
      references: [wikiSpaces.id],
    }),
    user: one(users, {
      fields: [wikiSpaceMembers.userId],
      references: [users.id],
    }),
  })
);

export const wikiPagesRelations = relations(wikiPages, ({ one, many }) => ({
  space: one(wikiSpaces, {
    fields: [wikiPages.spaceId],
    references: [wikiSpaces.id],
  }),
  document: one(documents, {
    fields: [wikiPages.documentId],
    references: [documents.id],
  }),
  parentPage: one(wikiPages, {
    fields: [wikiPages.parentPageId],
    references: [wikiPages.id],
    relationName: "pageChildren",
  }),
  children: many(wikiPages, {
    relationName: "pageChildren",
  }),
  creator: one(users, {
    fields: [wikiPages.createdBy],
    references: [users.id],
  }),
}));

// Type exports
export type WikiSpace = typeof wikiSpaces.$inferSelect;
export type NewWikiSpace = typeof wikiSpaces.$inferInsert;
export type WikiSpaceMember = typeof wikiSpaceMembers.$inferSelect;
export type NewWikiSpaceMember = typeof wikiSpaceMembers.$inferInsert;
export type WikiPage = typeof wikiPages.$inferSelect;
export type NewWikiPage = typeof wikiPages.$inferInsert;
