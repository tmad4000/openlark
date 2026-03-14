import { db } from "../../db/index.js";
import {
  forms,
  formQuestions,
  formResponses,
} from "../../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import type {
  CreateFormInput,
  UpdateFormInput,
  SubmitResponseInput,
  FormsQueryInput,
  ResponsesQueryInput,
} from "./forms.schemas.js";

export class FormsService {
  // ============ FORMS ============

  async createForm(input: CreateFormInput, userId: string, orgId: string) {
    const [form] = await db
      .insert(forms)
      .values({
        orgId,
        title: input.title,
        description: input.description,
        baseId: input.baseId,
        tableId: input.tableId,
        settings: input.settings,
        theme: input.theme,
        creatorId: userId,
      })
      .returning();

    if (!form) {
      throw new Error("Failed to create form");
    }

    // Create questions if provided
    if (input.questions.length > 0) {
      const questionValues = input.questions.map((q, idx) => ({
        formId: form.id,
        type: q.type,
        config: q.config,
        position: q.position ?? idx,
        required: q.required,
        displayCondition: q.displayCondition,
      }));

      await db.insert(formQuestions).values(questionValues);
    }

    return this.getFormById(form.id);
  }

  async getFormById(formId: string) {
    const [form] = await db.select().from(forms).where(eq(forms.id, formId));

    if (!form) return null;

    const questions = await db
      .select()
      .from(formQuestions)
      .where(eq(formQuestions.formId, formId))
      .orderBy(formQuestions.position);

    return { ...form, questions };
  }

  async getFormsByUser(userId: string, orgId: string, query: FormsQueryInput) {
    return db
      .select()
      .from(forms)
      .where(and(eq(forms.orgId, orgId), eq(forms.creatorId, userId)))
      .orderBy(forms.createdAt)
      .limit(query.limit)
      .offset(query.offset);
  }

  async deleteForm(formId: string) {
    await db.delete(forms).where(eq(forms.id, formId));
  }

  async updateForm(formId: string, input: UpdateFormInput) {
    const existing = await this.getFormById(formId);
    if (!existing) return null;

    // Update form fields
    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.settings !== undefined) updateData.settings = input.settings;
    if (input.theme !== undefined) updateData.theme = input.theme;

    if (Object.keys(updateData).length > 0) {
      await db.update(forms).set(updateData).where(eq(forms.id, formId));
    }

    // Replace questions if provided
    if (input.questions !== undefined) {
      await db.delete(formQuestions).where(eq(formQuestions.formId, formId));

      if (input.questions.length > 0) {
        const questionValues = input.questions.map((q, idx) => ({
          formId,
          type: q.type,
          config: q.config,
          position: q.position ?? idx,
          required: q.required,
          displayCondition: q.displayCondition ?? undefined,
        }));

        await db.insert(formQuestions).values(questionValues);
      }
    }

    return this.getFormById(formId);
  }

  // ============ RESPONSES ============

  async submitResponse(
    formId: string,
    input: SubmitResponseInput,
    respondentId: string
  ) {
    // Get form with questions for validation
    const form = await this.getFormById(formId);
    if (!form) return null;

    // Validate required fields
    const answers = input.answers as Record<string, unknown>;
    for (const question of form.questions) {
      if (question.required) {
        const answer = answers[question.id];
        if (answer === undefined || answer === null || answer === "") {
          return {
            error: "missing_required" as const,
            questionId: question.id,
          };
        }
      }

      // Evaluate display conditions — skip validation for hidden questions
      if (question.displayCondition) {
        const condition = question.displayCondition as Record<string, unknown>;
        const dependsOn = condition.dependsOn as string | undefined;
        const expectedValue = condition.value;
        if (dependsOn && answers[dependsOn] !== expectedValue) {
          continue; // Question is hidden, skip validation
        }
      }
    }

    // Check response limits from settings
    const settings = form.settings as Record<string, unknown>;
    const maxResponses = settings.maxResponses as number | undefined;
    if (maxResponses) {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(formResponses)
        .where(eq(formResponses.formId, formId));
      if (countResult && countResult.count >= maxResponses) {
        return { error: "response_limit_reached" as const };
      }
    }

    const [response] = await db
      .insert(formResponses)
      .values({
        formId,
        respondentId,
        answers: input.answers,
      })
      .returning();

    if (!response) {
      throw new Error("Failed to submit form response");
    }

    return response;
  }

  async getResponses(formId: string, query: ResponsesQueryInput) {
    return db
      .select()
      .from(formResponses)
      .where(eq(formResponses.formId, formId))
      .orderBy(formResponses.submittedAt)
      .limit(query.limit)
      .offset(query.offset);
  }
}

export const formsService = new FormsService();
