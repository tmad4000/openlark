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
import { organizations } from "./organizations";
import { users } from "./users";

// Email message status enum
export const emailStatusEnum = pgEnum("email_status", [
  "draft",
  "queued",
  "sent",
  "failed",
  "bounced",
]);

// Email folder enum
export const emailFolderEnum = pgEnum("email_folder", [
  "inbox",
  "sent",
  "drafts",
  "trash",
  "spam",
  "archive",
]);

// Email domains table
export const emailDomains = pgTable(
  "email_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 255 }).notNull(),
    verified: boolean("verified").notNull().default(false),
    verificationToken: varchar("verification_token", { length: 255 }),
    mxConfigured: boolean("mx_configured").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_domains_org_id_idx").on(table.orgId),
    index("email_domains_domain_idx").on(table.domain),
  ]
);

export type EmailDomain = typeof emailDomains.$inferSelect;
export type NewEmailDomain = typeof emailDomains.$inferInsert;

// Mailboxes table
export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailAddress: varchar("email_address", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    isPrimary: boolean("is_primary").notNull().default(true),
    signature: text("signature"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mailboxes_org_id_idx").on(table.orgId),
    index("mailboxes_user_id_idx").on(table.userId),
    index("mailboxes_email_address_idx").on(table.emailAddress),
  ]
);

export type Mailbox = typeof mailboxes.$inferSelect;
export type NewMailbox = typeof mailboxes.$inferInsert;

// Email messages table
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    fromAddress: varchar("from_address", { length: 255 }).notNull(),
    toAddresses: jsonb("to_addresses").notNull().$type<string[]>(),
    ccAddresses: jsonb("cc_addresses").$type<string[]>(),
    bccAddresses: jsonb("bcc_addresses").$type<string[]>(),
    subject: varchar("subject", { length: 998 }).notNull().default(""),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    folder: emailFolderEnum("folder").notNull().default("inbox"),
    status: emailStatusEnum("status").notNull().default("draft"),
    isRead: boolean("is_read").notNull().default(false),
    isFlagged: boolean("is_flagged").notNull().default(false),
    attachments: jsonb("attachments").$type<
      Array<{ name: string; url: string; size: number; mimeType: string }>
    >(),
    inReplyTo: uuid("in_reply_to"),
    threadId: uuid("thread_id"),
    externalMessageId: varchar("external_message_id", { length: 255 }),
    sentAt: timestamp("sent_at"),
    receivedAt: timestamp("received_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_messages_org_id_idx").on(table.orgId),
    index("email_messages_mailbox_id_idx").on(table.mailboxId),
    index("email_messages_folder_idx").on(table.folder),
    index("email_messages_thread_id_idx").on(table.threadId),
    index("email_messages_sent_at_idx").on(table.sentAt),
    index("email_messages_received_at_idx").on(table.receivedAt),
  ]
);

export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;

// Mailing lists table
export const mailingLists = pgTable(
  "mailing_lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    emailAddress: varchar("email_address", { length: 255 }).notNull(),
    description: text("description"),
    memberIds: jsonb("member_ids").notNull().$type<string[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mailing_lists_org_id_idx").on(table.orgId),
    index("mailing_lists_email_address_idx").on(table.emailAddress),
  ]
);

export type MailingList = typeof mailingLists.$inferSelect;
export type NewMailingList = typeof mailingLists.$inferInsert;
