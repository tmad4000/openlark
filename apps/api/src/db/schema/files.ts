import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// Files table - file upload metadata with S3 storage
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("files_org_id_idx").on(table.orgId),
    index("files_uploader_id_idx").on(table.uploaderId),
  ]
);

// Relations
export const filesRelations = relations(files, ({ one }) => ({
  organization: one(organizations, {
    fields: [files.orgId],
    references: [organizations.id],
  }),
  uploader: one(users, {
    fields: [files.uploaderId],
    references: [users.id],
  }),
}));

// Type exports
export type FileRecord = typeof files.$inferSelect;
export type NewFileRecord = typeof files.$inferInsert;
