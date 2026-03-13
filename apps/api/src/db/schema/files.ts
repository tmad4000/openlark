import { pgTable, uuid, varchar, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Files table - tracks uploaded file metadata
export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 500 }).notNull(),
  s3Key: text("s3_key").notNull().unique(),
  size: integer("size").notNull(), // bytes
  contentType: varchar("content_type", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("files_org_id_idx").on(table.orgId),
  index("files_uploader_id_idx").on(table.uploaderId),
]);
