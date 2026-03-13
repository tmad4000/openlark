import { FastifyInstance } from "fastify";
import { db } from "../db";
import { forms, formQuestions, formResponses } from "../db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreateFormBody {
  title: string;
  description?: string;
  base_id?: string;
  table_id?: string;
  settings?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  questions?: CreateQuestionBody[];
}

interface CreateQuestionBody {
  type:
    | "text"
    | "single_select"
    | "multi_choice"
    | "rating"
    | "nps"
    | "location"
    | "date"
    | "person"
    | "file"
    | "number";
  config?: Record<string, unknown>;
  position?: number;
  required?: boolean;
  display_condition?: Record<string, unknown> | null;
}

interface SubmitResponseBody {
  answers: Record<string, unknown>;
}

interface ResponsesQuery {
  cursor?: string;
  limit?: string;
}

const VALID_QUESTION_TYPES = [
  "text",
  "single_select",
  "multi_choice",
  "rating",
  "nps",
  "location",
  "date",
  "person",
  "file",
  "number",
] as const;

export async function formsRoutes(fastify: FastifyInstance) {
  // POST /forms - Create a form
  fastify.post<{ Body: CreateFormBody }>(
    "/forms",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { title, description, base_id, table_id, settings, theme, questions } =
        request.body || {};

      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return reply.status(400).send({ error: "Title is required" });
      }

      if (base_id && !UUID_REGEX.test(base_id)) {
        return reply.status(400).send({ error: "Invalid base_id format" });
      }

      if (table_id && !UUID_REGEX.test(table_id)) {
        return reply.status(400).send({ error: "Invalid table_id format" });
      }

      const [form] = await db
        .insert(forms)
        .values({
          orgId: user.orgId!,
          title: title.trim(),
          description: description?.trim() || null,
          baseId: base_id || null,
          tableId: table_id || null,
          settings: settings || {},
          theme: theme || {},
          creatorId: user.id,
        })
        .returning();

      // Create questions if provided
      let createdQuestions: typeof formQuestions.$inferSelect[] = [];
      if (questions && Array.isArray(questions) && questions.length > 0) {
        for (const q of questions) {
          if (!VALID_QUESTION_TYPES.includes(q.type as (typeof VALID_QUESTION_TYPES)[number])) {
            return reply
              .status(400)
              .send({ error: `Invalid question type: ${q.type}` });
          }
        }

        const questionValues = questions.map((q, index) => ({
          formId: form.id,
          type: q.type as (typeof VALID_QUESTION_TYPES)[number],
          config: q.config || {},
          position: q.position ?? index,
          required: q.required ?? false,
          displayCondition: q.display_condition ?? null,
        }));

        createdQuestions = await db
          .insert(formQuestions)
          .values(questionValues)
          .returning();
      }

      return reply.status(201).send({
        form: { ...form, questions: createdQuestions },
      });
    }
  );

  // GET /forms - List user's forms
  fastify.get(
    "/forms",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;

      const userForms = await db
        .select()
        .from(forms)
        .where(eq(forms.orgId, user.orgId!))
        .orderBy(desc(forms.createdAt));

      return reply.send({ forms: userForms });
    }
  );

  // GET /forms/:id - Get single form with questions
  fastify.get<{ Params: { id: string } }>(
    "/forms/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid form ID" });
      }

      const [form] = await db
        .select()
        .from(forms)
        .where(and(eq(forms.id, id), eq(forms.orgId, request.user.orgId!)))
        .limit(1);

      if (!form) {
        return reply.status(404).send({ error: "Form not found" });
      }

      const questions = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.formId, id))
        .orderBy(formQuestions.position);

      return reply.send({ form: { ...form, questions } });
    }
  );

  // PUT /forms/:id - Update a form and its questions
  fastify.put<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string | null;
      settings?: Record<string, unknown>;
      theme?: Record<string, unknown>;
      questions?: Array<{
        id?: string;
        type: (typeof VALID_QUESTION_TYPES)[number];
        config?: Record<string, unknown>;
        position?: number;
        required?: boolean;
        display_condition?: Record<string, unknown> | null;
      }>;
    };
  }>(
    "/forms/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid form ID" });
      }

      const [existing] = await db
        .select()
        .from(forms)
        .where(and(eq(forms.id, id), eq(forms.orgId, user.orgId!)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Form not found" });
      }

      const { title, description, settings, theme, questions } =
        request.body || {};

      // Update form metadata
      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title.trim();
      if (description !== undefined) updates.description = description;
      if (settings !== undefined) updates.settings = settings;
      if (theme !== undefined) updates.theme = theme;

      let updatedForm = existing;
      if (Object.keys(updates).length > 0) {
        const [result] = await db
          .update(forms)
          .set(updates)
          .where(eq(forms.id, id))
          .returning();
        updatedForm = result;
      }

      // Replace questions if provided
      let updatedQuestions: typeof formQuestions.$inferSelect[] = [];
      if (questions !== undefined) {
        // Validate question types
        for (const q of questions) {
          if (
            !VALID_QUESTION_TYPES.includes(
              q.type as (typeof VALID_QUESTION_TYPES)[number]
            )
          ) {
            return reply
              .status(400)
              .send({ error: `Invalid question type: ${q.type}` });
          }
        }

        // Delete existing questions and re-insert
        await db
          .delete(formQuestions)
          .where(eq(formQuestions.formId, id));

        if (questions.length > 0) {
          const questionValues = questions.map((q, index) => ({
            formId: id,
            type: q.type as (typeof VALID_QUESTION_TYPES)[number],
            config: q.config || {},
            position: q.position ?? index,
            required: q.required ?? false,
            displayCondition: q.display_condition ?? null,
          }));

          updatedQuestions = await db
            .insert(formQuestions)
            .values(questionValues)
            .returning();
        }
      } else {
        updatedQuestions = await db
          .select()
          .from(formQuestions)
          .where(eq(formQuestions.formId, id))
          .orderBy(formQuestions.position);
      }

      return reply.send({
        form: { ...updatedForm, questions: updatedQuestions },
      });
    }
  );

  // DELETE /forms/:id - Delete a form
  fastify.delete<{ Params: { id: string } }>(
    "/forms/:id",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid form ID" });
      }

      const [existing] = await db
        .select()
        .from(forms)
        .where(and(eq(forms.id, id), eq(forms.orgId, user.orgId!)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Form not found" });
      }

      await db.delete(forms).where(eq(forms.id, id));

      return reply.status(204).send();
    }
  );

  // POST /forms/:id/responses - Submit a form response
  fastify.post<{ Params: { id: string }; Body: SubmitResponseBody }>(
    "/forms/:id/responses",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;
      const { answers } = request.body || {};

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid form ID" });
      }

      if (!answers || typeof answers !== "object") {
        return reply
          .status(400)
          .send({ error: "answers is required and must be an object" });
      }

      // Verify form exists
      const [form] = await db
        .select()
        .from(forms)
        .where(eq(forms.id, id))
        .limit(1);

      if (!form) {
        return reply.status(404).send({ error: "Form not found" });
      }

      // Load questions for validation
      const questions = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.formId, id))
        .orderBy(formQuestions.position);

      // Validate required fields
      for (const q of questions) {
        if (q.required) {
          const answer = (answers as Record<string, unknown>)[q.id];
          if (answer === undefined || answer === null || answer === "") {
            const config = q.config as Record<string, unknown> | null;
            const label = config?.label || `Question ${q.position + 1}`;
            return reply.status(400).send({
              error: `Required field "${label}" is missing`,
            });
          }
        }
      }

      // Check submission limits from settings
      const settings = form.settings as Record<string, unknown> | null;
      if (settings?.maxResponses) {
        const maxResponses = settings.maxResponses as number;
        const [countResult] = await db
          .select({ count: formResponses.id })
          .from(formResponses)
          .where(eq(formResponses.formId, id));

        // Count manually since we're just checking existence
        const existingResponses = await db
          .select({ id: formResponses.id })
          .from(formResponses)
          .where(eq(formResponses.formId, id));

        if (existingResponses.length >= maxResponses) {
          return reply
            .status(400)
            .send({ error: "This form has reached its maximum number of responses" });
        }
      }

      // Check one-per-user limit
      if (settings?.oneResponsePerUser) {
        const existingUserResponse = await db
          .select({ id: formResponses.id })
          .from(formResponses)
          .where(
            and(
              eq(formResponses.formId, id),
              eq(formResponses.respondentId, user.id)
            )
          )
          .limit(1);

        if (existingUserResponse.length > 0) {
          return reply
            .status(400)
            .send({ error: "You have already submitted a response to this form" });
        }
      }

      const [response] = await db
        .insert(formResponses)
        .values({
          formId: id,
          respondentId: user.id,
          answers,
        })
        .returning();

      return reply.status(201).send({ response });
    }
  );

  // GET /forms/:id/responses - List form responses with pagination
  fastify.get<{ Params: { id: string }; Querystring: ResponsesQuery }>(
    "/forms/:id/responses",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params;
      const { cursor, limit: limitStr } = request.query;

      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: "Invalid form ID" });
      }

      const limit = Math.min(Math.max(parseInt(limitStr || "50", 10) || 50, 1), 100);

      // Verify form exists and belongs to user's org
      const [form] = await db
        .select()
        .from(forms)
        .where(and(eq(forms.id, id), eq(forms.orgId, user.orgId!)))
        .limit(1);

      if (!form) {
        return reply.status(404).send({ error: "Form not found" });
      }

      const conditions = [eq(formResponses.formId, id)];

      if (cursor) {
        conditions.push(lt(formResponses.submittedAt, new Date(cursor)));
      }

      const responses = await db
        .select()
        .from(formResponses)
        .where(and(...conditions))
        .orderBy(desc(formResponses.submittedAt))
        .limit(limit + 1);

      const hasMore = responses.length > limit;
      const results = hasMore ? responses.slice(0, limit) : responses;
      const nextCursor = hasMore
        ? results[results.length - 1].submittedAt.toISOString()
        : null;

      return reply.send({
        responses: results,
        nextCursor,
        hasMore,
      });
    }
  );
}
