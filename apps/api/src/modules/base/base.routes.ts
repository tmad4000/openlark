import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createBaseSchema,
  updateBaseSchema,
  createTableSchema,
  createFieldSchema,
  updateFieldSchema,
  createRecordSchema,
  updateRecordSchema,
  recordsQuerySchema,
  createViewSchema,
  updateViewSchema,
  createDashboardSchema,
  updateDashboardSchema,
} from "./base.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { baseService } from "./base.service.js";
import { ZodError } from "zod";

export async function baseRoutes(app: FastifyInstance) {
  // ============ PUBLIC FORM ROUTES (no auth) ============

  // Get form definition (public)
  app.get<{ Params: { viewId: string } }>(
    "/forms/:viewId",
    async (req, reply) => {
      const view = await baseService.getViewById(req.params.viewId);
      if (!view || view.type !== "form") {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Form not found",
        });
      }

      const config = (view.config as Record<string, unknown>) || {};
      if (!config.isPublic) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "This form is not publicly accessible",
        });
      }

      const table = await baseService.getTableById(view.tableId);
      const fields = await baseService.getTableFields(view.tableId);

      return {
        data: {
          tableName: table?.name || "Form",
          fields,
          config,
        },
      };
    }
  );

  // Submit form (public)
  app.post<{ Params: { viewId: string } }>(
    "/forms/:viewId/submit",
    async (req, reply) => {
      const view = await baseService.getViewById(req.params.viewId);
      if (!view || view.type !== "form") {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Form not found",
        });
      }

      const config = (view.config as Record<string, unknown>) || {};
      if (!config.isPublic) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "This form is not publicly accessible",
        });
      }

      try {
        const input = createRecordSchema.parse(req.body);
        const record = await baseService.createRecord(
          view.tableId,
          input,
          "anonymous"
        );
        return reply.status(201).send({ data: { record } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  app.addHook("preHandler", authenticate);

  // ============ BASE ROUTES ============

  // List bases
  app.get("/bases", async (req: FastifyRequest, reply: FastifyReply) => {
    const bases = await baseService.getUserBases(req.user!.id, req.user!.orgId);
    return { data: { bases } };
  });

  // Create base
  app.post("/bases", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = createBaseSchema.parse(req.body);
      const base = await baseService.createBase(
        input,
        req.user!.id,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { base } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // Get base
  app.get<{ Params: { id: string } }>(
    "/bases/:id",
    async (req, reply) => {
      const base = await baseService.getBaseById(req.params.id);
      if (!base) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Base not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        req.params.id,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      return { data: { base } };
    }
  );

  // Update base
  app.patch<{ Params: { id: string } }>(
    "/bases/:id",
    async (req, reply) => {
      try {
        const canAccess = await baseService.canAccessBase(
          req.params.id,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = updateBaseSchema.parse(req.body);
        const updated = await baseService.updateBase(req.params.id, input);
        if (!updated) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Base not found",
          });
        }

        return { data: { base: updated } };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Delete base
  app.delete<{ Params: { id: string } }>(
    "/bases/:id",
    async (req, reply) => {
      const canAccess = await baseService.canAccessBase(
        req.params.id,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const deleted = await baseService.deleteBase(req.params.id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Base not found",
        });
      }

      return reply.status(204).send();
    }
  );

  // ============ TABLE ROUTES ============

  // List tables for a base
  app.get<{ Params: { id: string } }>(
    "/bases/:id/tables",
    async (req, reply) => {
      const canAccess = await baseService.canAccessBase(
        req.params.id,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const tables = await baseService.getBaseTables(req.params.id);
      return { data: { tables } };
    }
  );

  // Create table in base
  app.post<{ Params: { id: string } }>(
    "/bases/:id/tables",
    async (req, reply) => {
      try {
        const canAccess = await baseService.canAccessBase(
          req.params.id,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = createTableSchema.parse(req.body);
        const table = await baseService.createTable(req.params.id, input);
        return reply.status(201).send({ data: { table } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // ============ FIELD ROUTES ============

  // List fields for a table
  app.get<{ Params: { id: string } }>(
    "/tables/:id/fields",
    async (req, reply) => {
      const baseId = await baseService.getTableBaseId(req.params.id);
      if (!baseId) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Table not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const fields = await baseService.getTableFields(req.params.id);
      return { data: { fields } };
    }
  );

  // Create field in table
  app.post<{ Params: { id: string } }>(
    "/tables/:id/fields",
    async (req, reply) => {
      try {
        const baseId = await baseService.getTableBaseId(req.params.id);
        if (!baseId) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Table not found",
          });
        }

        const canAccess = await baseService.canAccessBase(
          baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = createFieldSchema.parse(req.body);
        const field = await baseService.createField(req.params.id, input);
        return reply.status(201).send({ data: { field } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Update field
  app.patch<{ Params: { id: string } }>(
    "/fields/:id",
    async (req, reply) => {
      try {
        const field = await baseService.getFieldById(req.params.id);
        if (!field) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Field not found",
          });
        }

        const baseId = await baseService.getTableBaseId(field.tableId);
        if (!baseId) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Table not found",
          });
        }

        const canAccess = await baseService.canAccessBase(
          baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = updateFieldSchema.parse(req.body);
        const updated = await baseService.updateField(req.params.id, input);

        if (!updated) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Field not found",
          });
        }

        return { data: { field: updated } };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Delete field
  app.delete<{ Params: { id: string } }>(
    "/fields/:id",
    async (req, reply) => {
      const field = await baseService.getFieldById(req.params.id);
      if (!field) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Field not found",
        });
      }

      const baseId = await baseService.getTableBaseId(field.tableId);
      if (!baseId) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Table not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const deleted = await baseService.deleteField(req.params.id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Field not found",
        });
      }

      return reply.status(204).send();
    }
  );

  // ============ RECORD ROUTES ============

  // Create record
  app.post<{ Params: { id: string } }>(
    "/tables/:id/records",
    async (req, reply) => {
      try {
        const baseId = await baseService.getTableBaseId(req.params.id);
        if (!baseId) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Table not found",
          });
        }

        const canAccess = await baseService.canAccessBase(
          baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = createRecordSchema.parse(req.body);
        const record = await baseService.createRecord(
          req.params.id,
          input,
          req.user!.id
        );
        return reply.status(201).send({ data: { record } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // List records with pagination, filtering, sorting
  app.get<{ Params: { id: string } }>(
    "/tables/:id/records",
    async (req, reply) => {
      const baseId = await baseService.getTableBaseId(req.params.id);
      if (!baseId) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Table not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const parseResult = recordsQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        return reply.status(400).send(formatZodError(parseResult.error));
      }

      const { page, limit, sort, order, filter: filterStr } = parseResult.data;

      let filter: Record<string, { op: string; value: unknown }> | undefined;
      if (filterStr) {
        try {
          filter = JSON.parse(filterStr);
        } catch {
          return reply.status(400).send({
            code: "VALIDATION_ERROR",
            message: "Invalid filter JSON",
          });
        }
      }

      const result = await baseService.getTableRecords(req.params.id, {
        page,
        limit,
        sort,
        order,
        filter,
      });

      return {
        data: {
          records: result.records,
          pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit),
          },
        },
      };
    }
  );

  // Update record
  app.patch<{ Params: { id: string } }>(
    "/records/:id",
    async (req, reply) => {
      try {
        const tableId = await baseService.getRecordTableId(req.params.id);
        if (!tableId) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Record not found",
          });
        }

        const baseId = await baseService.getTableBaseId(tableId);
        if (!baseId) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Table not found",
          });
        }

        const canAccess = await baseService.canAccessBase(
          baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = updateRecordSchema.parse(req.body);
        const record = await baseService.updateRecord(req.params.id, input.data);

        if (!record) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Record not found",
          });
        }

        return { data: { record } };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Delete record (soft delete)
  app.delete<{ Params: { id: string } }>(
    "/records/:id",
    async (req, reply) => {
      const tableId = await baseService.getRecordTableId(req.params.id);
      if (!tableId) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Record not found",
        });
      }

      const baseId = await baseService.getTableBaseId(tableId);
      if (!baseId) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Table not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const deleted = await baseService.deleteRecord(req.params.id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Record not found",
        });
      }

      return reply.status(204).send();
    }
  );

  // ============ VIEW ROUTES ============

  // List views for a table
  app.get<{ Params: { id: string } }>(
    "/tables/:id/views",
    async (req, reply) => {
      const baseId = await baseService.getTableBaseId(req.params.id);
      if (!baseId) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Table not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const views = await baseService.getTableViews(req.params.id);
      return { data: { views } };
    }
  );

  // Create view for a table
  app.post<{ Params: { id: string } }>(
    "/tables/:id/views",
    async (req, reply) => {
      try {
        const baseId = await baseService.getTableBaseId(req.params.id);
        if (!baseId) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Table not found",
          });
        }

        const canAccess = await baseService.canAccessBase(
          baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = createViewSchema.parse(req.body);
        const view = await baseService.createView(req.params.id, input);
        return reply.status(201).send({ data: { view } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Update view
  app.patch<{ Params: { id: string } }>(
    "/views/:id",
    async (req, reply) => {
      try {
        const view = await baseService.getViewById(req.params.id);
        if (!view) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "View not found",
          });
        }

        const baseId = await baseService.getTableBaseId(view.tableId);
        if (!baseId) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Table not found",
          });
        }

        const canAccess = await baseService.canAccessBase(
          baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = updateViewSchema.parse(req.body);
        const updated = await baseService.updateView(req.params.id, input);

        if (!updated) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "View not found",
          });
        }

        return { data: { view: updated } };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // ============ DASHBOARD ROUTES ============

  // List dashboards for a base
  app.get<{ Params: { id: string } }>(
    "/bases/:id/dashboards",
    async (req, reply) => {
      const canAccess = await baseService.canAccessBase(
        req.params.id,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const dashboards = await baseService.getBaseDashboards(req.params.id);
      return { data: { dashboards } };
    }
  );

  // Create dashboard
  app.post<{ Params: { id: string } }>(
    "/bases/:id/dashboards",
    async (req, reply) => {
      try {
        const canAccess = await baseService.canAccessBase(
          req.params.id,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = createDashboardSchema.parse(req.body);
        const dashboard = await baseService.createDashboard(
          req.params.id,
          input
        );
        return reply.status(201).send({ data: { dashboard } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Get dashboard
  app.get<{ Params: { id: string } }>(
    "/dashboards/:id",
    async (req, reply) => {
      const dashboard = await baseService.getDashboardById(req.params.id);
      if (!dashboard) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Dashboard not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        dashboard.baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      return { data: { dashboard } };
    }
  );

  // Update dashboard
  app.patch<{ Params: { id: string } }>(
    "/dashboards/:id",
    async (req, reply) => {
      try {
        const dashboard = await baseService.getDashboardById(req.params.id);
        if (!dashboard) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Dashboard not found",
          });
        }

        const canAccess = await baseService.canAccessBase(
          dashboard.baseId,
          req.user!.orgId
        );
        if (!canAccess) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You do not have access to this base",
          });
        }

        const input = updateDashboardSchema.parse(req.body);
        const updated = await baseService.updateDashboard(
          req.params.id,
          input
        );

        if (!updated) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Dashboard not found",
          });
        }

        return { data: { dashboard: updated } };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Delete dashboard
  app.delete<{ Params: { id: string } }>(
    "/dashboards/:id",
    async (req, reply) => {
      const dashboard = await baseService.getDashboardById(req.params.id);
      if (!dashboard) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Dashboard not found",
        });
      }

      const canAccess = await baseService.canAccessBase(
        dashboard.baseId,
        req.user!.orgId
      );
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this base",
        });
      }

      const deleted = await baseService.deleteDashboard(req.params.id);
      if (!deleted) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Dashboard not found",
        });
      }

      return reply.status(204).send();
    }
  );
}
