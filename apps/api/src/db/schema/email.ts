import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, users } from "./auth";

// ============ ENUMS ============

export const emailFolderEnum = pgEnum("email_folder", [
  "inbox",
  "sent",
  "drafts",
  "trash",
  "archive",
  "spam",
]);

export const emailStatusEnum = pgEnum("email_status", [
  "draft",
  "queued",
  "sent",
  "failed",
]);

// ============ TABLES ============

export const emailDomains = pgTable(
  "email_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    domain: varchar("domain", { length: 255 }).notNull(),
    verified: boolean("verified").notNull().default(false),
    verificationToken: varchar("verification_token", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_domains_org_id_idx").on(table.orgId),
    index("email_domains_domain_idx").on(table.domain),
  ]
);

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mailboxes_org_id_idx").on(table.orgId),
    index("mailboxes_user_id_idx").on(table.userId),
    index("mailboxes_address_idx").on(table.address),
  ]
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    fromAddress: varchar("from_address", { length: 255 }).notNull(),
    toAddresses: jsonb("to_addresses").notNull().$type<string[]>(),
    ccAddresses: jsonb("cc_addresses").$type<string[]>(),
    bccAddresses: jsonb("bcc_addresses").$type<string[]>(),
    subject: varchar("subject", { length: 998 }).notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text"),
    attachments: jsonb("attachments").$type<
      { name: string; url: string; size: number; mimeType: string }[]
    >(),
    folder: emailFolderEnum("folder").notNull().default("inbox"),
    status: emailStatusEnum("status").notNull().default("draft"),
    isRead: boolean("is_read").notNull().default(false),
    isFlagged: boolean("is_flagged").notNull().default(false),
    inReplyTo: uuid("in_reply_to"),
    threadId: uuid("thread_id"),
    externalMessageId: varchar("external_message_id", { length: 255 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_messages_org_id_idx").on(table.orgId),
    index("email_messages_mailbox_id_idx").on(table.mailboxId),
    index("email_messages_folder_idx").on(table.folder),
    index("email_messages_thread_id_idx").on(table.threadId),
    index("email_messages_sent_at_idx").on(table.sentAt),
    index("email_messages_mailbox_folder_idx").on(table.mailboxId, table.folder),
  ]
);

export const mailingLists = pgTable(
  "mailing_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 255 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    description: text("description"),
    memberIds: jsonb("member_ids").notNull().$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mailing_lists_org_id_idx").on(table.orgId),
    index("mailing_lists_address_idx").on(table.address),
  ]
);

// ============ RELATIONS ============

export const emailDomainsRelations = relations(emailDomains, ({ one }) => ({
  organization: one(organizations, {
    fields: [emailDomains.orgId],
    references: [organizations.id],
  }),
}));

export const mailboxesRelations = relations(mailboxes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [mailboxes.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [mailboxes.userId],
    references: [users.id],
  }),
  messages: many(emailMessages),
}));

export const emailMessagesRelations = relations(
  emailMessages,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [emailMessages.orgId],
      references: [organizations.id],
    }),
    mailbox: one(mailboxes, {
      fields: [emailMessages.mailboxId],
      references: [mailboxes.id],
    }),
  })
);

export const mailingListsRelations = relations(mailingLists, ({ one }) => ({
  organization: one(organizations, {
    fields: [mailingLists.orgId],
    references: [organizations.id],
  }),
}));

// ============ TYPES ============

export type EmailDomain = typeof emailDomains.$inferSelect;
export type NewEmailDomain = typeof emailDomains.$inferInsert;
export type Mailbox = typeof mailboxes.$inferSelect;
export type NewMailbox = typeof mailboxes.$inferInsert;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;
export type MailingList = typeof mailingLists.$inferSelect;
export type NewMailingList = typeof mailingLists.$inferInsert;
