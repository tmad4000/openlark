import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  primaryKey,
  foreignKey,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// Department member role enum
export const departmentRoleEnum = pgEnum("department_role", ["head", "member"]);

// Departments table - supports hierarchical structure via parent_id
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => departments.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Index on org_id for efficient organization-based queries
    index("departments_org_id_idx").on(table.orgId),
    // Index on parent_id for efficient tree traversal
    index("departments_parent_id_idx").on(table.parentId),
  ]
);

// Department members junction table
export const departmentMembers = pgTable(
  "department_members",
  {
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: departmentRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite primary key on (department_id, user_id)
    primaryKey({ columns: [table.departmentId, table.userId] }),
  ]
);

// Type exports
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type DepartmentMember = typeof departmentMembers.$inferSelect;
export type NewDepartmentMember = typeof departmentMembers.$inferInsert;
