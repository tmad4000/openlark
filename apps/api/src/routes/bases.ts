import { FastifyInstance } from "fastify";
import { db } from "../db";
import { bases, baseTables, baseFields, baseRecords, baseViews, users } from "../db/schema";
import { eq, and, desc, asc, sql, gt, lt, ilike, inArray } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid field types
const VALID_FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "currency",
  "percent",
  "date",
  "datetime",
  "checkbox",
  "single_select",
  "multi_select",
  "user",
  "attachment",
  "url",
  "email",
  "phone",
  "rating",
  "duration",
  "barcode",
  "formula",
  "rollup",
  "lookup",
  "link",
  "autonumber",
  "created_time",
  "modified_time",
  "created_by",
  "modified_by",
  "button",
] as const;

type FieldType = (typeof VALID_FIELD_TYPES)[number];

// Filter operators
const VALID_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "is_empty",
  "is_not_empty",
  "in",
] as const;

type FilterOperator = (typeof VALID_OPERATORS)[number];

interface CreateBaseBody {
  name: string;
  icon?: string;
}

interface CreateTableBody {
  name: string;
}

interface CreateFieldBody {
  name: string;
  type: FieldType;
  config?: Record<string, unknown>;
}

interface UpdateFieldBody {
  name?: string;
  type?: FieldType;
  config?: Record<string, unknown>;
}

interface CreateRecordBody {
  data: Record<string, unknown>;
}

interface UpdateRecordBody {
  data: Record<string, unknown>;
}

interface FilterCondition {
  op: FilterOperator;
  value: unknown;
}

interface GetRecordsQuery {
  limit?: number;
  cursor?: string;
  filters?: string; // JSON string: { fieldId: { op: string, value: unknown } }
  sort?: string; // JSON string: { fieldId: string, direction: 'asc' | 'desc' }[]
}

export async function basesRoutes(fastify: FastifyInstance) {
  /**
   * POST /bases - Create a new base
   * Body: { name: string, icon?: string }
   * Returns: Created base
   */
  fastify.post<{ Body: CreateBaseBody }>(
    "/bases",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { name, icon } = request.body;

      // Validate name
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      if (name.length > 255) {
        return reply.status(400).send({
          error: "name must be at most 255 characters",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization to create bases",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Create the base
      const [newBase] = await db
        .insert(bases)
        .values({
          name: name.trim(),
          icon: icon?.trim() || null,
          orgId,
          ownerId: currentUserId,
        })
        .returning();

      return reply.status(201).send({
        id: newBase.id,
        name: newBase.name,
        icon: newBase.icon,
        ownerId: newBase.ownerId,
        orgId: newBase.orgId,
        createdAt: newBase.createdAt,
        updatedAt: newBase.updatedAt,
      });
    }
  );

  /**
   * GET /bases - List user's bases
   * Query: { limit?: number, offset?: number }
   * Returns: Paginated list of bases
   */
  fastify.get<{ Querystring: { limit?: number; offset?: number } }>(
    "/bases",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { limit = 50, offset = 0 } = request.query;

      // Validate limit and offset
      const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const parsedOffset = Math.max(Number(offset) || 0, 0);

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bases)
        .where(eq(bases.orgId, orgId));

      const total = countResult?.count ?? 0;

      // Get bases with owner info
      const basesList = await db
        .select({
          id: bases.id,
          name: bases.name,
          icon: bases.icon,
          ownerId: bases.ownerId,
          orgId: bases.orgId,
          createdAt: bases.createdAt,
          updatedAt: bases.updatedAt,
          ownerName: users.displayName,
          ownerAvatarUrl: users.avatarUrl,
        })
        .from(bases)
        .innerJoin(users, eq(bases.ownerId, users.id))
        .where(eq(bases.orgId, orgId))
        .orderBy(desc(bases.updatedAt))
        .limit(parsedLimit)
        .offset(parsedOffset);

      return reply.status(200).send({
        bases: basesList.map((b) => ({
          id: b.id,
          name: b.name,
          icon: b.icon,
          ownerId: b.ownerId,
          orgId: b.orgId,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          owner: {
            id: b.ownerId,
            displayName: b.ownerName,
            avatarUrl: b.ownerAvatarUrl,
          },
        })),
        pagination: {
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + basesList.length < total,
        },
      });
    }
  );

  /**
   * GET /bases/:id - Get a specific base
   * Returns: Base with tables
   */
  fastify.get<{ Params: { id: string } }>(
    "/bases/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid base ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the base
      const [base] = await db
        .select()
        .from(bases)
        .where(and(eq(bases.id, id), eq(bases.orgId, orgId)))
        .limit(1);

      if (!base) {
        return reply.status(404).send({
          error: "Base not found",
        });
      }

      // Get owner info
      const [owner] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, base.ownerId))
        .limit(1);

      // Get tables
      const tables = await db
        .select()
        .from(baseTables)
        .where(eq(baseTables.baseId, id))
        .orderBy(asc(baseTables.position));

      return reply.status(200).send({
        id: base.id,
        name: base.name,
        icon: base.icon,
        ownerId: base.ownerId,
        orgId: base.orgId,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
        owner,
        tables: tables.map((t) => ({
          id: t.id,
          name: t.name,
          position: t.position,
          createdAt: t.createdAt,
        })),
      });
    }
  );

  /**
   * POST /bases/:id/tables - Create a new table in a base
   * Body: { name: string }
   * Returns: Created table
   */
  fastify.post<{ Params: { id: string }; Body: CreateTableBody }>(
    "/bases/:id/tables",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid base ID format",
        });
      }

      // Validate name
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      if (name.length > 255) {
        return reply.status(400).send({
          error: "name must be at most 255 characters",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Check if base exists and belongs to user's org
      const [base] = await db
        .select()
        .from(bases)
        .where(and(eq(bases.id, id), eq(bases.orgId, orgId)))
        .limit(1);

      if (!base) {
        return reply.status(404).send({
          error: "Base not found",
        });
      }

      // Get max position
      const [maxPos] = await db
        .select({ max: sql<number>`coalesce(max(position), -1)::int` })
        .from(baseTables)
        .where(eq(baseTables.baseId, id));

      const newPosition = (maxPos?.max ?? -1) + 1;

      // Create the table
      const [newTable] = await db
        .insert(baseTables)
        .values({
          baseId: id,
          name: name.trim(),
          position: newPosition,
        })
        .returning();

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, id));

      return reply.status(201).send({
        id: newTable.id,
        baseId: newTable.baseId,
        name: newTable.name,
        position: newTable.position,
        createdAt: newTable.createdAt,
      });
    }
  );

  /**
   * GET /bases/:id/tables - Get tables in a base
   * Returns: Array of tables
   */
  fastify.get<{ Params: { id: string } }>(
    "/bases/:id/tables",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid base ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Check if base exists and belongs to user's org
      const [base] = await db
        .select()
        .from(bases)
        .where(and(eq(bases.id, id), eq(bases.orgId, orgId)))
        .limit(1);

      if (!base) {
        return reply.status(404).send({
          error: "Base not found",
        });
      }

      // Get tables with field counts
      const tables = await db
        .select({
          id: baseTables.id,
          baseId: baseTables.baseId,
          name: baseTables.name,
          position: baseTables.position,
          createdAt: baseTables.createdAt,
        })
        .from(baseTables)
        .where(eq(baseTables.baseId, id))
        .orderBy(asc(baseTables.position));

      return reply.status(200).send({
        tables,
      });
    }
  );

  /**
   * GET /tables/:id - Get a specific table with fields
   * Returns: Table with fields and views
   */
  fastify.get<{ Params: { id: string } }>(
    "/tables/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid table ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the table with base info
      const [table] = await db
        .select({
          id: baseTables.id,
          baseId: baseTables.baseId,
          name: baseTables.name,
          position: baseTables.position,
          createdAt: baseTables.createdAt,
          baseOrgId: bases.orgId,
        })
        .from(baseTables)
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseTables.id, id))
        .limit(1);

      if (!table) {
        return reply.status(404).send({
          error: "Table not found",
        });
      }

      // Check org access
      if (table.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Get fields
      const fields = await db
        .select()
        .from(baseFields)
        .where(eq(baseFields.tableId, id))
        .orderBy(asc(baseFields.position));

      // Get views
      const views = await db
        .select()
        .from(baseViews)
        .where(eq(baseViews.tableId, id))
        .orderBy(asc(baseViews.position));

      return reply.status(200).send({
        id: table.id,
        baseId: table.baseId,
        name: table.name,
        position: table.position,
        createdAt: table.createdAt,
        fields: fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          config: f.config,
          position: f.position,
        })),
        views: views.map((v) => ({
          id: v.id,
          name: v.name,
          type: v.type,
          config: v.config,
          position: v.position,
        })),
      });
    }
  );

  /**
   * POST /tables/:id/fields - Create a new field in a table
   * Body: { name: string, type: FieldType, config?: object }
   * Returns: Created field
   */
  fastify.post<{ Params: { id: string }; Body: CreateFieldBody }>(
    "/tables/:id/fields",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, type, config } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid table ID format",
        });
      }

      // Validate name
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      if (name.length > 255) {
        return reply.status(400).send({
          error: "name must be at most 255 characters",
        });
      }

      // Validate type
      if (!type || !VALID_FIELD_TYPES.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${VALID_FIELD_TYPES.join(", ")}`,
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the table with base info
      const [table] = await db
        .select({
          id: baseTables.id,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseTables)
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseTables.id, id))
        .limit(1);

      if (!table) {
        return reply.status(404).send({
          error: "Table not found",
        });
      }

      // Check org access
      if (table.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Get max position
      const [maxPos] = await db
        .select({ max: sql<number>`coalesce(max(position), -1)::int` })
        .from(baseFields)
        .where(eq(baseFields.tableId, id));

      const newPosition = (maxPos?.max ?? -1) + 1;

      // Create the field
      const [newField] = await db
        .insert(baseFields)
        .values({
          tableId: id,
          name: name.trim(),
          type,
          config: config || {},
          position: newPosition,
        })
        .returning();

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, table.baseId));

      return reply.status(201).send({
        id: newField.id,
        tableId: newField.tableId,
        name: newField.name,
        type: newField.type,
        config: newField.config,
        position: newField.position,
      });
    }
  );

  /**
   * PATCH /fields/:id - Update a field
   * Body: { name?: string, type?: FieldType, config?: object }
   * Returns: Updated field
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateFieldBody }>(
    "/fields/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, type, config } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid field ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the field with table and base info
      const [field] = await db
        .select({
          id: baseFields.id,
          tableId: baseFields.tableId,
          name: baseFields.name,
          type: baseFields.type,
          config: baseFields.config,
          position: baseFields.position,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseFields)
        .innerJoin(baseTables, eq(baseFields.tableId, baseTables.id))
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseFields.id, id))
        .limit(1);

      if (!field) {
        return reply.status(404).send({
          error: "Field not found",
        });
      }

      // Check org access
      if (field.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Build update object
      const updates: Record<string, unknown> = {};

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return reply.status(400).send({
            error: "name must be a non-empty string",
          });
        }
        if (name.length > 255) {
          return reply.status(400).send({
            error: "name must be at most 255 characters",
          });
        }
        updates.name = name.trim();
      }

      if (type !== undefined) {
        if (!VALID_FIELD_TYPES.includes(type)) {
          return reply.status(400).send({
            error: `type must be one of: ${VALID_FIELD_TYPES.join(", ")}`,
          });
        }
        updates.type = type;
      }

      if (config !== undefined) {
        // Merge with existing config
        const existingConfig = (field.config ?? {}) as Record<string, unknown>;
        updates.config = { ...existingConfig, ...config };
      }

      // If no updates, return current field
      if (Object.keys(updates).length === 0) {
        return reply.status(200).send({
          id: field.id,
          tableId: field.tableId,
          name: field.name,
          type: field.type,
          config: field.config,
          position: field.position,
        });
      }

      // Update the field
      const [updatedField] = await db
        .update(baseFields)
        .set(updates)
        .where(eq(baseFields.id, id))
        .returning();

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, field.baseId));

      return reply.status(200).send({
        id: updatedField.id,
        tableId: updatedField.tableId,
        name: updatedField.name,
        type: updatedField.type,
        config: updatedField.config,
        position: updatedField.position,
      });
    }
  );

  /**
   * DELETE /fields/:id - Delete a field
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string } }>(
    "/fields/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid field ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the field with table and base info
      const [field] = await db
        .select({
          id: baseFields.id,
          tableId: baseFields.tableId,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseFields)
        .innerJoin(baseTables, eq(baseFields.tableId, baseTables.id))
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseFields.id, id))
        .limit(1);

      if (!field) {
        return reply.status(404).send({
          error: "Field not found",
        });
      }

      // Check org access
      if (field.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Delete the field
      await db.delete(baseFields).where(eq(baseFields.id, id));

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, field.baseId));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * POST /tables/:id/records - Create a new record
   * Body: { data: { fieldId: value, ... } }
   * Returns: Created record
   */
  fastify.post<{ Params: { id: string }; Body: CreateRecordBody }>(
    "/tables/:id/records",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { data } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid table ID format",
        });
      }

      // Validate data
      if (!data || typeof data !== "object") {
        return reply.status(400).send({
          error: "data is required and must be an object",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const currentUserId = request.user.id;
      const orgId = request.user.orgId;

      // Get the table with base info
      const [table] = await db
        .select({
          id: baseTables.id,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseTables)
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseTables.id, id))
        .limit(1);

      if (!table) {
        return reply.status(404).send({
          error: "Table not found",
        });
      }

      // Check org access
      if (table.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Create the record
      const [newRecord] = await db
        .insert(baseRecords)
        .values({
          tableId: id,
          data,
          createdBy: currentUserId,
        })
        .returning();

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, table.baseId));

      return reply.status(201).send({
        id: newRecord.id,
        tableId: newRecord.tableId,
        data: newRecord.data,
        createdBy: newRecord.createdBy,
        createdAt: newRecord.createdAt,
        updatedAt: newRecord.updatedAt,
      });
    }
  );

  /**
   * GET /tables/:id/records - Get records in a table with pagination, filtering, sorting
   * Query: { limit?, cursor?, filters?: JSON, sort?: JSON }
   * Filtering syntax: { fieldId: { op: 'eq|gt|lt|contains|in', value: ... } }
   * Returns: Paginated list of records
   */
  fastify.get<{ Params: { id: string }; Querystring: GetRecordsQuery }>(
    "/tables/:id/records",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { limit = 50, cursor, filters, sort } = request.query;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid table ID format",
        });
      }

      // Validate limit
      const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the table with base info
      const [table] = await db
        .select({
          id: baseTables.id,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseTables)
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseTables.id, id))
        .limit(1);

      if (!table) {
        return reply.status(404).send({
          error: "Table not found",
        });
      }

      // Check org access
      if (table.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Build where conditions
      const conditions: ReturnType<typeof eq>[] = [eq(baseRecords.tableId, id)];

      // Handle cursor-based pagination
      if (cursor && UUID_REGEX.test(cursor)) {
        // Get the cursor record's createdAt
        const [cursorRecord] = await db
          .select({ createdAt: baseRecords.createdAt })
          .from(baseRecords)
          .where(eq(baseRecords.id, cursor))
          .limit(1);

        if (cursorRecord) {
          conditions.push(lt(baseRecords.createdAt, cursorRecord.createdAt));
        }
      }

      // Parse and apply filters
      if (filters) {
        try {
          const filterObj = JSON.parse(filters) as Record<string, FilterCondition>;

          for (const [fieldId, condition] of Object.entries(filterObj)) {
            if (!condition || typeof condition !== "object") continue;

            const { op, value } = condition;

            if (!VALID_OPERATORS.includes(op as FilterOperator)) continue;

            // Build JSONB filter condition
            const jsonPath = `data->>'${fieldId}'`;

            switch (op) {
              case "eq":
                conditions.push(sql`${sql.raw(jsonPath)} = ${String(value)}`);
                break;
              case "neq":
                conditions.push(sql`${sql.raw(jsonPath)} != ${String(value)}`);
                break;
              case "gt":
                conditions.push(sql`(${sql.raw(jsonPath)})::numeric > ${Number(value)}`);
                break;
              case "gte":
                conditions.push(sql`(${sql.raw(jsonPath)})::numeric >= ${Number(value)}`);
                break;
              case "lt":
                conditions.push(sql`(${sql.raw(jsonPath)})::numeric < ${Number(value)}`);
                break;
              case "lte":
                conditions.push(sql`(${sql.raw(jsonPath)})::numeric <= ${Number(value)}`);
                break;
              case "contains":
                conditions.push(sql`${sql.raw(jsonPath)} ILIKE ${"%" + String(value) + "%"}`);
                break;
              case "not_contains":
                conditions.push(sql`${sql.raw(jsonPath)} NOT ILIKE ${"%" + String(value) + "%"}`);
                break;
              case "is_empty":
                conditions.push(sql`(${sql.raw(jsonPath)} IS NULL OR ${sql.raw(jsonPath)} = '')`);
                break;
              case "is_not_empty":
                conditions.push(sql`(${sql.raw(jsonPath)} IS NOT NULL AND ${sql.raw(jsonPath)} != '')`);
                break;
              case "in":
                if (Array.isArray(value)) {
                  const valueList = value.map((v) => `'${String(v)}'`).join(",");
                  conditions.push(sql`${sql.raw(jsonPath)} IN (${sql.raw(valueList)})`);
                }
                break;
            }
          }
        } catch {
          return reply.status(400).send({
            error: "Invalid filters format - must be valid JSON",
          });
        }
      }

      // Build order by
      let orderByClause: ReturnType<typeof desc> = desc(baseRecords.createdAt);

      if (sort) {
        try {
          const sortArr = JSON.parse(sort) as Array<{ fieldId: string; direction: "asc" | "desc" }>;

          if (sortArr.length > 0) {
            const firstSort = sortArr[0];
            if (firstSort && firstSort.fieldId && ["asc", "desc"].includes(firstSort.direction)) {
              const jsonPath = `data->>'${firstSort.fieldId}'`;
              orderByClause =
                firstSort.direction === "asc"
                  ? sql`${sql.raw(jsonPath)} ASC NULLS LAST`
                  : sql`${sql.raw(jsonPath)} DESC NULLS LAST`;
            }
          }
        } catch {
          return reply.status(400).send({
            error: "Invalid sort format - must be valid JSON array",
          });
        }
      }

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(baseRecords)
        .where(and(...conditions));

      const total = countResult?.count ?? 0;

      // Get records
      const records = await db
        .select({
          id: baseRecords.id,
          tableId: baseRecords.tableId,
          data: baseRecords.data,
          createdBy: baseRecords.createdBy,
          createdAt: baseRecords.createdAt,
          updatedAt: baseRecords.updatedAt,
        })
        .from(baseRecords)
        .where(and(...conditions))
        .orderBy(orderByClause)
        .limit(parsedLimit + 1); // Get one extra to check hasMore

      const hasMore = records.length > parsedLimit;
      const resultRecords = hasMore ? records.slice(0, parsedLimit) : records;
      const nextCursor = hasMore && resultRecords.length > 0 ? resultRecords[resultRecords.length - 1]?.id : null;

      return reply.status(200).send({
        records: resultRecords,
        pagination: {
          total,
          limit: parsedLimit,
          cursor: cursor || null,
          nextCursor,
          hasMore,
        },
      });
    }
  );

  /**
   * PATCH /records/:id - Update a record
   * Body: { data: { fieldId: value, ... } }
   * Returns: Updated record
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateRecordBody }>(
    "/records/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { data } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid record ID format",
        });
      }

      // Validate data
      if (!data || typeof data !== "object") {
        return reply.status(400).send({
          error: "data is required and must be an object",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the record with table and base info
      const [record] = await db
        .select({
          id: baseRecords.id,
          tableId: baseRecords.tableId,
          data: baseRecords.data,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseRecords)
        .innerJoin(baseTables, eq(baseRecords.tableId, baseTables.id))
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseRecords.id, id))
        .limit(1);

      if (!record) {
        return reply.status(404).send({
          error: "Record not found",
        });
      }

      // Check org access
      if (record.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Merge data with existing data
      const existingData = (record.data ?? {}) as Record<string, unknown>;
      const newData = { ...existingData, ...data };

      // Update the record
      const [updatedRecord] = await db
        .update(baseRecords)
        .set({
          data: newData,
          updatedAt: new Date(),
        })
        .where(eq(baseRecords.id, id))
        .returning();

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, record.baseId));

      return reply.status(200).send({
        id: updatedRecord.id,
        tableId: updatedRecord.tableId,
        data: updatedRecord.data,
        createdBy: updatedRecord.createdBy,
        createdAt: updatedRecord.createdAt,
        updatedAt: updatedRecord.updatedAt,
      });
    }
  );

  /**
   * DELETE /records/:id - Delete a record (hard delete for now, can be changed to soft delete)
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string } }>(
    "/records/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid record ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the record with table and base info
      const [record] = await db
        .select({
          id: baseRecords.id,
          tableId: baseRecords.tableId,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseRecords)
        .innerJoin(baseTables, eq(baseRecords.tableId, baseTables.id))
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseRecords.id, id))
        .limit(1);

      if (!record) {
        return reply.status(404).send({
          error: "Record not found",
        });
      }

      // Check org access
      if (record.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Delete the record (hard delete - schema doesn't have deletedAt)
      await db.delete(baseRecords).where(eq(baseRecords.id, id));

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, record.baseId));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * POST /tables/:id/views - Create a new view
   * Body: { name: string, type: 'grid' | 'kanban' | 'calendar' | 'gantt' | 'gallery' | 'form', config?: object }
   * Returns: Created view
   */
  fastify.post<{
    Params: { id: string };
    Body: { name: string; type: string; config?: Record<string, unknown> };
  }>(
    "/tables/:id/views",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, type, config } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid table ID format",
        });
      }

      // Validate name
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.status(400).send({
          error: "name is required and must be a non-empty string",
        });
      }

      if (name.length > 255) {
        return reply.status(400).send({
          error: "name must be at most 255 characters",
        });
      }

      // Validate type
      const validTypes = ["grid", "kanban", "calendar", "gantt", "gallery", "form"];
      if (!type || !validTypes.includes(type)) {
        return reply.status(400).send({
          error: `type must be one of: ${validTypes.join(", ")}`,
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the table with base info
      const [table] = await db
        .select({
          id: baseTables.id,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseTables)
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseTables.id, id))
        .limit(1);

      if (!table) {
        return reply.status(404).send({
          error: "Table not found",
        });
      }

      // Check org access
      if (table.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Get max position
      const [maxPos] = await db
        .select({ max: sql<number>`coalesce(max(position), -1)::int` })
        .from(baseViews)
        .where(eq(baseViews.tableId, id));

      const newPosition = (maxPos?.max ?? -1) + 1;

      // Create the view
      const [newView] = await db
        .insert(baseViews)
        .values({
          tableId: id,
          name: name.trim(),
          type: type as "grid" | "kanban" | "calendar" | "gantt" | "gallery" | "form",
          config: config || {},
          position: newPosition,
        })
        .returning();

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, table.baseId));

      return reply.status(201).send({
        id: newView.id,
        tableId: newView.tableId,
        name: newView.name,
        type: newView.type,
        config: newView.config,
        position: newView.position,
      });
    }
  );

  /**
   * PATCH /views/:id - Update a view
   * Body: { name?: string, config?: object }
   * Returns: Updated view
   */
  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; config?: Record<string, unknown> };
  }>(
    "/views/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { name, config } = request.body;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid view ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the view with table and base info
      const [view] = await db
        .select({
          id: baseViews.id,
          tableId: baseViews.tableId,
          name: baseViews.name,
          type: baseViews.type,
          config: baseViews.config,
          position: baseViews.position,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseViews)
        .innerJoin(baseTables, eq(baseViews.tableId, baseTables.id))
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseViews.id, id))
        .limit(1);

      if (!view) {
        return reply.status(404).send({
          error: "View not found",
        });
      }

      // Check org access
      if (view.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Build update object
      const updates: Record<string, unknown> = {};

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return reply.status(400).send({
            error: "name must be a non-empty string",
          });
        }
        if (name.length > 255) {
          return reply.status(400).send({
            error: "name must be at most 255 characters",
          });
        }
        updates.name = name.trim();
      }

      if (config !== undefined) {
        // Merge with existing config
        const existingConfig = (view.config ?? {}) as Record<string, unknown>;
        updates.config = { ...existingConfig, ...config };
      }

      // If no updates, return current view
      if (Object.keys(updates).length === 0) {
        return reply.status(200).send({
          id: view.id,
          tableId: view.tableId,
          name: view.name,
          type: view.type,
          config: view.config,
          position: view.position,
        });
      }

      // Update the view
      const [updatedView] = await db
        .update(baseViews)
        .set(updates)
        .where(eq(baseViews.id, id))
        .returning();

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, view.baseId));

      return reply.status(200).send({
        id: updatedView.id,
        tableId: updatedView.tableId,
        name: updatedView.name,
        type: updatedView.type,
        config: updatedView.config,
        position: updatedView.position,
      });
    }
  );

  /**
   * DELETE /views/:id - Delete a view
   * Returns: { success: true }
   */
  fastify.delete<{ Params: { id: string } }>(
    "/views/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      // Validate UUID format
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({
          error: "Invalid view ID format",
        });
      }

      // User must belong to an organization
      if (!request.user.orgId) {
        return reply.status(400).send({
          error: "User must belong to an organization",
        });
      }

      const orgId = request.user.orgId;

      // Get the view with table and base info
      const [view] = await db
        .select({
          id: baseViews.id,
          tableId: baseViews.tableId,
          baseId: baseTables.baseId,
          baseOrgId: bases.orgId,
        })
        .from(baseViews)
        .innerJoin(baseTables, eq(baseViews.tableId, baseTables.id))
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(eq(baseViews.id, id))
        .limit(1);

      if (!view) {
        return reply.status(404).send({
          error: "View not found",
        });
      }

      // Check org access
      if (view.baseOrgId !== orgId) {
        return reply.status(403).send({
          error: "Access denied",
        });
      }

      // Delete the view
      await db.delete(baseViews).where(eq(baseViews.id, id));

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, view.baseId));

      return reply.status(200).send({ success: true });
    }
  );

  /**
   * GET /forms/:token - Get public form by share token (no auth required)
   * Returns: Form view data with table fields
   */
  fastify.get<{
    Params: { token: string };
  }>(
    "/forms/:token",
    async (request, reply) => {
      const { token } = request.params;

      // Find the view with this share token
      const [result] = await db
        .select({
          viewId: baseViews.id,
          viewName: baseViews.name,
          viewType: baseViews.type,
          viewConfig: baseViews.config,
          tableId: baseTables.id,
          tableName: baseTables.name,
        })
        .from(baseViews)
        .innerJoin(baseTables, eq(baseViews.tableId, baseTables.id))
        .where(
          sql`${baseViews.config}->>'formShareToken' = ${token} AND ${baseViews.config}->>'formPublicAccess' = 'true'`
        )
        .limit(1);

      if (!result) {
        return reply.status(404).send({
          error: "Form not found or not publicly accessible",
        });
      }

      // Get fields for this table
      const fields = await db
        .select()
        .from(baseFields)
        .where(eq(baseFields.tableId, result.tableId))
        .orderBy(asc(baseFields.position));

      // Filter out hidden fields based on view config
      const config = result.viewConfig as Record<string, unknown> || {};
      const hiddenFields = (config.hiddenFields as string[]) || [];
      const visibleFields = fields.filter((f) => !hiddenFields.includes(f.id));

      return reply.status(200).send({
        id: result.viewId,
        name: result.viewName,
        description: config.formDescription || "",
        submitLabel: config.formSubmitLabel || "Submit",
        successMessage: config.formSuccessMessage || "Thank you! Your response has been recorded.",
        requiredFields: (config.formRequiredFields as string[]) || [],
        fields: visibleFields.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          config: f.config,
        })),
      });
    }
  );

  /**
   * POST /forms/:token/submit - Submit a public form (no auth required)
   * Body: { data: Record<string, unknown> }
   * Returns: Created record ID
   */
  fastify.post<{
    Params: { token: string };
    Body: { data: Record<string, unknown> };
  }>(
    "/forms/:token/submit",
    async (request, reply) => {
      const { token } = request.params;
      const { data } = request.body;

      if (!data || typeof data !== "object") {
        return reply.status(400).send({
          error: "data is required and must be an object",
        });
      }

      // Find the view with this share token
      const [result] = await db
        .select({
          viewId: baseViews.id,
          viewConfig: baseViews.config,
          tableId: baseTables.id,
          baseId: baseTables.baseId,
          baseOwnerId: bases.ownerId,
        })
        .from(baseViews)
        .innerJoin(baseTables, eq(baseViews.tableId, baseTables.id))
        .innerJoin(bases, eq(baseTables.baseId, bases.id))
        .where(
          sql`${baseViews.config}->>'formShareToken' = ${token} AND ${baseViews.config}->>'formPublicAccess' = 'true'`
        )
        .limit(1);

      if (!result) {
        return reply.status(404).send({
          error: "Form not found or not publicly accessible",
        });
      }

      // Get fields for validation
      const fields = await db
        .select()
        .from(baseFields)
        .where(eq(baseFields.tableId, result.tableId));

      const fieldMap = new Map(fields.map((f) => [f.id, f]));
      const config = result.viewConfig as Record<string, unknown> || {};
      const requiredFields = (config.formRequiredFields as string[]) || [];

      // Validate required fields
      for (const fieldId of requiredFields) {
        const value = data[fieldId];
        if (value === undefined || value === null || value === "") {
          const field = fieldMap.get(fieldId);
          return reply.status(400).send({
            error: `${field?.name || "Field"} is required`,
          });
        }
      }

      // Validate field IDs exist
      const validFieldIds = new Set(fields.map((f) => f.id));
      const cleanData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (validFieldIds.has(key)) {
          cleanData[key] = value;
        }
      }

      // Create the record (using base owner as the creator for anonymous submissions)
      const [newRecord] = await db
        .insert(baseRecords)
        .values({
          tableId: result.tableId,
          data: cleanData,
          createdBy: result.baseOwnerId,
        })
        .returning();

      // Update base's updatedAt
      await db
        .update(bases)
        .set({ updatedAt: new Date() })
        .where(eq(bases.id, result.baseId));

      return reply.status(201).send({
        id: newRecord.id,
        success: true,
      });
    }
  );
}
