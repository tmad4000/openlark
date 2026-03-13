import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createWikiSpaceSchema,
  updateWikiSpaceSchema,
  createWikiPageSchema,
  updateWikiPageSchema,
} from "./wiki.schemas.js";
import { authenticate } from "../auth/middleware.js";
import { formatZodError } from "../../utils/validation.js";
import { wikiService } from "./wiki.service.js";
import { ZodError } from "zod";

export async function wikiRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook("preHandler", authenticate);

  // ============ SPACE ROUTES ============

  // List user's spaces
  app.get("/spaces", async (req: FastifyRequest, reply: FastifyReply) => {
    const spaces = await wikiService.getUserSpaces(
      req.user!.id,
      req.user!.orgId
    );
    return { data: { spaces } };
  });

  // Create space
  app.post("/spaces", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = createWikiSpaceSchema.parse(req.body);
      const space = await wikiService.createSpace(
        input,
        req.user!.id,
        req.user!.orgId
      );
      return reply.status(201).send({ data: { space } });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  });

  // Get space
  app.get<{ Params: { id: string } }>(
    "/spaces/:id",
    async (req, reply) => {
      const { id } = req.params;

      const canAccess = await wikiService.canAccessSpace(id, req.user!.id);
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this space",
        });
      }

      const space = await wikiService.getSpaceById(id);
      if (!space) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Wiki space not found",
        });
      }

      return { data: { space } };
    }
  );

  // Update space
  app.patch<{ Params: { id: string } }>(
    "/spaces/:id",
    async (req, reply) => {
      try {
        const input = updateWikiSpaceSchema.parse(req.body);
        const space = await wikiService.updateSpace(
          req.params.id,
          input,
          req.user!.id
        );

        if (!space) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Wiki space not found",
          });
        }

        return { data: { space } };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (error instanceof Error && error.message.includes("Not authorized")) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // Delete space
  app.delete<{ Params: { id: string } }>(
    "/spaces/:id",
    async (req, reply) => {
      try {
        const deleted = await wikiService.deleteSpace(
          req.params.id,
          req.user!.id
        );

        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Wiki space not found",
          });
        }

        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error && error.message.includes("Not authorized")) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // ============ PAGE ROUTES ============

  // Get space pages (tree)
  app.get<{ Params: { id: string } }>(
    "/spaces/:id/pages",
    async (req, reply) => {
      const { id } = req.params;

      const canAccess = await wikiService.canAccessSpace(id, req.user!.id);
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this space",
        });
      }

      const pages = await wikiService.getSpacePages(id);
      return { data: { pages } };
    }
  );

  // Create page in space
  app.post<{ Params: { id: string } }>(
    "/spaces/:id/pages",
    async (req, reply) => {
      const { id } = req.params;

      const canAccess = await wikiService.canAccessSpace(id, req.user!.id);
      if (!canAccess) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "You do not have access to this space",
        });
      }

      try {
        const input = createWikiPageSchema.parse(req.body);
        const page = await wikiService.createPage(
          id,
          input,
          req.user!.id,
          req.user!.orgId
        );
        return reply.status(201).send({ data: { page } });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        throw error;
      }
    }
  );

  // Move/reorder page
  app.patch<{ Params: { id: string } }>(
    "/pages/:id",
    async (req, reply) => {
      try {
        const input = updateWikiPageSchema.parse(req.body);
        const page = await wikiService.updatePage(
          req.params.id,
          input,
          req.user!.id
        );

        if (!page) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Wiki page not found",
          });
        }

        return { data: { page } };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(formatZodError(error));
        }
        if (error instanceof Error && error.message.includes("Not authorized")) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // Delete page
  app.delete<{ Params: { id: string } }>(
    "/pages/:id",
    async (req, reply) => {
      try {
        const deleted = await wikiService.deletePage(
          req.params.id,
          req.user!.id
        );

        if (!deleted) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Wiki page not found",
          });
        }

        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error && error.message.includes("Not authorized")) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );
}
