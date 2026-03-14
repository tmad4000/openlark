import type { FastifyInstance } from "fastify";
import { minutesService } from "./minutes.service.js";
import { authenticate } from "../auth/middleware.js";

export async function minutesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /minutes/:id - Get minutes with meeting and recording info
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const result = await minutesService.getMinutes(req.params.id);
    if (!result) {
      return reply.status(404).send({
        code: "MINUTES_NOT_FOUND",
        message: "Minutes not found",
      });
    }
    return reply.send({ data: result });
  });

  // GET /minutes/:id/comments - List comments for minutes
  app.get<{ Params: { id: string } }>("/:id/comments", async (req, reply) => {
    const comments = await minutesService.getComments(req.params.id);
    return reply.send({ data: { comments } });
  });

  // POST /minutes/:id/comments - Add a comment to a transcript paragraph
  app.post<{
    Params: { id: string };
    Body: { paragraphIndex: number; content: string };
  }>("/:id/comments", async (req, reply) => {
    const { paragraphIndex, content } = req.body as {
      paragraphIndex: number;
      content: string;
    };

    if (typeof paragraphIndex !== "number" || !content?.trim()) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: "paragraphIndex (number) and content (string) are required",
      });
    }

    const comment = await minutesService.addComment(
      req.params.id,
      req.user!.id,
      paragraphIndex,
      content.trim()
    );
    return reply.status(201).send({ data: { comment } });
  });

  // DELETE /minutes/:id/comments/:commentId - Delete a comment
  app.delete<{ Params: { id: string; commentId: string } }>(
    "/:id/comments/:commentId",
    async (req, reply) => {
      try {
        const comment = await minutesService.deleteComment(
          req.params.commentId,
          req.user!.id
        );
        if (!comment) {
          return reply.status(404).send({
            code: "COMMENT_NOT_FOUND",
            message: "Comment not found",
          });
        }
        return reply.send({ data: { comment } });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Not authorized")
        ) {
          return reply.status(403).send({
            code: "NOT_AUTHORIZED",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );
}
