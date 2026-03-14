import { db } from "../../db/index.js";
import {
  bases,
  baseTables,
  baseFields,
  baseRecords,
  baseViews,
  baseDashboards,
} from "../../db/schema/index.js";
import { eq, and, isNull, asc, desc, sql } from "drizzle-orm";
import type {
  CreateBaseInput,
  UpdateBaseInput,
  CreateTableInput,
  UpdateTableInput,
  CreateFieldInput,
  UpdateFieldInput,
  CreateRecordInput,
  UpdateRecordInput,
  CreateViewInput,
  UpdateViewInput,
  CreateDashboardInput,
  UpdateDashboardInput,
} from "./base.schemas.js";
import type {
  Base,
  BaseTable,
  BaseField,
  BaseRecord,
  BaseView,
  BaseDashboard,
} from "../../db/schema/index.js";

export class BaseService {
  // ============ BASE CRUD ============

  async createBase(
    input: CreateBaseInput,
    userId: string,
    orgId: string
  ): Promise<Base> {
    const [base] = await db
      .insert(bases)
      .values({
        orgId,
        name: input.name,
        icon: input.icon,
        ownerId: userId,
      })
      .returning();

    if (!base) throw new Error("Failed to create base");
    return base;
  }

  async getUserBases(userId: string, orgId: string): Promise<Base[]> {
    return db
      .select()
      .from(bases)
      .where(and(eq(bases.orgId, orgId), isNull(bases.deletedAt)))
      .orderBy(asc(bases.name));
  }

  async getBaseById(baseId: string): Promise<Base | null> {
    const [base] = await db
      .select()
      .from(bases)
      .where(and(eq(bases.id, baseId), isNull(bases.deletedAt)));
    return base ?? null;
  }

  async canAccessBase(baseId: string, orgId: string): Promise<boolean> {
    const base = await this.getBaseById(baseId);
    if (!base) return false;
    return base.orgId === orgId;
  }

  async updateBase(
    baseId: string,
    input: UpdateBaseInput
  ): Promise<Base | null> {
    const [updated] = await db
      .update(bases)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(bases.id, baseId), isNull(bases.deletedAt)))
      .returning();
    return updated ?? null;
  }

  async deleteBase(baseId: string): Promise<boolean> {
    const result = await db
      .update(bases)
      .set({ deletedAt: new Date() })
      .where(and(eq(bases.id, baseId), isNull(bases.deletedAt)))
      .returning({ id: bases.id });
    return result.length > 0;
  }

  // ============ TABLE CRUD ============

  async createTable(
    baseId: string,
    input: CreateTableInput
  ): Promise<BaseTable> {
    let position = input.position ?? 0;
    if (input.position === undefined) {
      const siblings = await db
        .select()
        .from(baseTables)
        .where(
          and(eq(baseTables.baseId, baseId), isNull(baseTables.deletedAt))
        );
      position = siblings.length;
    }

    const [table] = await db
      .insert(baseTables)
      .values({ baseId, name: input.name, position })
      .returning();

    if (!table) throw new Error("Failed to create table");

    // Create a default grid view
    await db.insert(baseViews).values({
      tableId: table.id,
      name: "Grid View",
      type: "grid",
      position: 0,
    });

    return table;
  }

  async getBaseTables(baseId: string): Promise<BaseTable[]> {
    return db
      .select()
      .from(baseTables)
      .where(and(eq(baseTables.baseId, baseId), isNull(baseTables.deletedAt)))
      .orderBy(asc(baseTables.position));
  }

  async getTableById(tableId: string): Promise<BaseTable | null> {
    const [table] = await db
      .select()
      .from(baseTables)
      .where(and(eq(baseTables.id, tableId), isNull(baseTables.deletedAt)));
    return table ?? null;
  }

  async getTableBaseId(tableId: string): Promise<string | null> {
    const table = await this.getTableById(tableId);
    return table?.baseId ?? null;
  }

  // ============ FIELD CRUD ============

  async createField(
    tableId: string,
    input: CreateFieldInput
  ): Promise<BaseField> {
    let position = input.position ?? 0;
    if (input.position === undefined) {
      const siblings = await db
        .select()
        .from(baseFields)
        .where(
          and(eq(baseFields.tableId, tableId), isNull(baseFields.deletedAt))
        );
      position = siblings.length;
    }

    const [field] = await db
      .insert(baseFields)
      .values({
        tableId,
        name: input.name,
        type: input.type,
        config: input.config ?? {},
        position,
      })
      .returning();

    if (!field) throw new Error("Failed to create field");
    return field;
  }

  async getTableFields(tableId: string): Promise<BaseField[]> {
    return db
      .select()
      .from(baseFields)
      .where(and(eq(baseFields.tableId, tableId), isNull(baseFields.deletedAt)))
      .orderBy(asc(baseFields.position));
  }

  async updateField(
    fieldId: string,
    input: UpdateFieldInput
  ): Promise<BaseField | null> {
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.config !== undefined) updateData.config = input.config;
    if (input.position !== undefined) updateData.position = input.position;

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await db
      .update(baseFields)
      .set(updateData)
      .where(and(eq(baseFields.id, fieldId), isNull(baseFields.deletedAt)))
      .returning();

    return updated ?? null;
  }

  async deleteField(fieldId: string): Promise<boolean> {
    const result = await db
      .update(baseFields)
      .set({ deletedAt: new Date() })
      .where(and(eq(baseFields.id, fieldId), isNull(baseFields.deletedAt)))
      .returning({ id: baseFields.id });

    return result.length > 0;
  }

  async getFieldById(fieldId: string): Promise<BaseField | null> {
    const [field] = await db
      .select()
      .from(baseFields)
      .where(and(eq(baseFields.id, fieldId), isNull(baseFields.deletedAt)));
    return field ?? null;
  }

  // ============ RECORD CRUD ============

  async createRecord(
    tableId: string,
    input: CreateRecordInput,
    userId: string
  ): Promise<BaseRecord> {
    const [record] = await db
      .insert(baseRecords)
      .values({
        tableId,
        data: input.data,
        createdBy: userId,
      })
      .returning();

    if (!record) throw new Error("Failed to create record");
    return record;
  }

  async getTableRecords(
    tableId: string,
    options: {
      page: number;
      limit: number;
      sort?: string;
      order: "asc" | "desc";
      filter?: Record<string, { op: string; value: unknown }>;
    }
  ): Promise<{ records: BaseRecord[]; total: number }> {
    const offset = (options.page - 1) * options.limit;

    const conditions = [
      eq(baseRecords.tableId, tableId),
      isNull(baseRecords.deletedAt),
    ];

    // Apply JSONB filters
    if (options.filter) {
      for (const [fieldId, { op, value }] of Object.entries(options.filter)) {
        const jsonPath = sql`${baseRecords.data}->${fieldId}`;
        switch (op) {
          case "eq":
            conditions.push(sql`${jsonPath} = ${JSON.stringify(value)}::jsonb`);
            break;
          case "gt":
            conditions.push(
              sql`(${jsonPath})::numeric > ${Number(value)}`
            );
            break;
          case "lt":
            conditions.push(
              sql`(${jsonPath})::numeric < ${Number(value)}`
            );
            break;
          case "contains":
            conditions.push(
              sql`${jsonPath}::text ILIKE ${"%" + String(value) + "%"}`
            );
            break;
          case "in": {
            const arr = Array.isArray(value) ? value : [value];
            conditions.push(
              sql`${jsonPath} = ANY(ARRAY[${sql.join(
                arr.map((v) => sql`${JSON.stringify(v)}::jsonb`),
                sql`, `
              )}])`
            );
            break;
          }
        }
      }
    }

    const orderFn = options.order === "desc" ? desc : asc;
    const orderBy = options.sort
      ? sql`${baseRecords.data}->${options.sort}`
      : baseRecords.createdAt;

    const [records, countResult] = await Promise.all([
      db
        .select()
        .from(baseRecords)
        .where(and(...conditions))
        .orderBy(options.sort ? sql`${orderBy} ${sql.raw(options.order)}` : orderFn(baseRecords.createdAt))
        .limit(options.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(baseRecords)
        .where(and(...conditions)),
    ]);

    return {
      records,
      total: countResult[0]?.count ?? 0,
    };
  }

  async getRecordById(recordId: string): Promise<BaseRecord | null> {
    const [record] = await db
      .select()
      .from(baseRecords)
      .where(
        and(eq(baseRecords.id, recordId), isNull(baseRecords.deletedAt))
      );
    return record ?? null;
  }

  async updateRecord(
    recordId: string,
    data: Record<string, unknown>
  ): Promise<BaseRecord | null> {
    const [updated] = await db
      .update(baseRecords)
      .set({ data, updatedAt: new Date() })
      .where(
        and(eq(baseRecords.id, recordId), isNull(baseRecords.deletedAt))
      )
      .returning();

    return updated ?? null;
  }

  async deleteRecord(recordId: string): Promise<boolean> {
    const result = await db
      .update(baseRecords)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(baseRecords.id, recordId), isNull(baseRecords.deletedAt))
      )
      .returning({ id: baseRecords.id });

    return result.length > 0;
  }

  async getRecordTableId(recordId: string): Promise<string | null> {
    const record = await this.getRecordById(recordId);
    return record?.tableId ?? null;
  }

  // ============ VIEW CRUD ============

  async getTableViews(tableId: string): Promise<BaseView[]> {
    return db
      .select()
      .from(baseViews)
      .where(and(eq(baseViews.tableId, tableId), isNull(baseViews.deletedAt)))
      .orderBy(asc(baseViews.position));
  }

  async createView(
    tableId: string,
    input: CreateViewInput
  ): Promise<BaseView> {
    let position = input.position ?? 0;
    if (input.position === undefined) {
      const siblings = await db
        .select()
        .from(baseViews)
        .where(
          and(eq(baseViews.tableId, tableId), isNull(baseViews.deletedAt))
        );
      position = siblings.length;
    }

    const [view] = await db
      .insert(baseViews)
      .values({
        tableId,
        name: input.name,
        type: input.type,
        config: input.config ?? {},
        position,
      })
      .returning();

    if (!view) throw new Error("Failed to create view");
    return view;
  }

  async updateView(
    viewId: string,
    input: UpdateViewInput
  ): Promise<BaseView | null> {
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.config !== undefined) updateData.config = input.config;
    if (input.position !== undefined) updateData.position = input.position;

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await db
      .update(baseViews)
      .set(updateData)
      .where(and(eq(baseViews.id, viewId), isNull(baseViews.deletedAt)))
      .returning();

    return updated ?? null;
  }

  async getViewById(viewId: string): Promise<BaseView | null> {
    const [view] = await db
      .select()
      .from(baseViews)
      .where(and(eq(baseViews.id, viewId), isNull(baseViews.deletedAt)));
    return view ?? null;
  }

  // ============ DASHBOARD CRUD ============

  async getBaseDashboards(baseId: string): Promise<BaseDashboard[]> {
    return db
      .select()
      .from(baseDashboards)
      .where(eq(baseDashboards.baseId, baseId))
      .orderBy(asc(baseDashboards.createdAt));
  }

  async getDashboardById(dashboardId: string): Promise<BaseDashboard | null> {
    const [dashboard] = await db
      .select()
      .from(baseDashboards)
      .where(eq(baseDashboards.id, dashboardId));
    return dashboard ?? null;
  }

  async createDashboard(
    baseId: string,
    input: CreateDashboardInput
  ): Promise<BaseDashboard> {
    const [dashboard] = await db
      .insert(baseDashboards)
      .values({
        baseId,
        name: input.name,
        layout: input.layout,
      })
      .returning();

    if (!dashboard) throw new Error("Failed to create dashboard");
    return dashboard;
  }

  async updateDashboard(
    dashboardId: string,
    input: UpdateDashboardInput
  ): Promise<BaseDashboard | null> {
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.layout !== undefined) updateData.layout = input.layout;

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await db
      .update(baseDashboards)
      .set(updateData)
      .where(eq(baseDashboards.id, dashboardId))
      .returning();

    return updated ?? null;
  }

  async deleteDashboard(dashboardId: string): Promise<boolean> {
    const result = await db
      .delete(baseDashboards)
      .where(eq(baseDashboards.id, dashboardId))
      .returning({ id: baseDashboards.id });

    return result.length > 0;
  }
}

export const baseService = new BaseService();
