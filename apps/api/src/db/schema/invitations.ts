import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Invitation status enum
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "declined",
  "revoked",
  "expired",
]);

// Invitations table - stores organization invitations
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    invitedById: uuid("invited_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Index on token_hash for fast invitation lookup
    index("invitations_token_hash_idx").on(table.tokenHash),
    // Index on org_id for finding all invitations for an organization
    index("invitations_org_id_idx").on(table.orgId),
    // Index on email for finding invitations for a specific email
    index("invitations_email_idx").on(table.email),
    // Composite index for checking existing pending invitations
    index("invitations_org_email_status_idx").on(
      table.orgId,
      table.email,
      table.status
    ),
  ]
);

// Type exports
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
