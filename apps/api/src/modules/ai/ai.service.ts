import { db } from "../../db/index.js";
import { aiJobs } from "../../db/schema/ai.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { config } from "../../config.js";

export interface AiCompleteInput {
  prompt: string;
  context?: string;
  type: "rewrite" | "summarize" | "expand" | "tone" | "complete";
  toneStyle?: string;
}

interface LlmResponse {
  text: string;
  model: string;
  tokens: number;
}

/**
 * Pluggable LLM backend. Supports OpenAI, Anthropic, and Ollama (local).
 * Configured via AI_PROVIDER and AI_API_KEY environment variables.
 */
async function callLlm(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
  const provider = (config as unknown as Record<string, string>).AI_PROVIDER || "mock";
  const apiKey = (config as unknown as Record<string, string>).AI_API_KEY || "";

  // Mock provider for development
  if (provider === "mock" || !apiKey) {
    const mockText = generateMockResponse(systemPrompt, userPrompt);
    return { text: mockText, model: "mock", tokens: mockText.length };
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: (config as unknown as Record<string, string>).AI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1000,
      }),
    });
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage: { total_tokens: number };
    };
    return {
      text: data.choices[0]?.message.content ?? "",
      model: data.model,
      tokens: data.usage.total_tokens,
    };
  }

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: (config as unknown as Record<string, string>).AI_MODEL || "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    const data = (await res.json()) as {
      content: Array<{ text: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      text: data.content[0]?.text ?? "",
      model: data.model,
      tokens: data.usage.input_tokens + data.usage.output_tokens,
    };
  }

  if (provider === "ollama") {
    const ollamaUrl = (config as unknown as Record<string, string>).OLLAMA_URL || "http://localhost:11434";
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: (config as unknown as Record<string, string>).AI_MODEL || "llama3",
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
      }),
    });
    const data = (await res.json()) as {
      response: string;
      model: string;
      total_duration: number;
    };
    return {
      text: data.response,
      model: data.model,
      tokens: userPrompt.length + data.response.length, // approximate
    };
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

function generateMockResponse(systemPrompt: string, userPrompt: string): string {
  // Simple mock for development without an LLM API key
  if (systemPrompt.includes("summarize")) {
    return `Summary: ${userPrompt.slice(0, 100)}...`;
  }
  if (systemPrompt.includes("expand")) {
    return `${userPrompt}\n\nFurthermore, this topic deserves deeper exploration. The key aspects include detailed analysis, comprehensive review, and thoughtful consideration of all relevant factors.`;
  }
  if (systemPrompt.includes("rewrite")) {
    return `Rewritten: ${userPrompt}`;
  }
  if (systemPrompt.includes("tone")) {
    return userPrompt;
  }
  return `AI response to: ${userPrompt.slice(0, 200)}`;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  rewrite: "You are a writing assistant. Rewrite the following text to improve clarity, grammar, and flow while preserving the original meaning. Return only the rewritten text.",
  summarize: "You are a writing assistant. Summarize the following text concisely, capturing the key points. Return only the summary.",
  expand: "You are a writing assistant. Expand the following text with more detail, examples, and explanation while maintaining the same tone. Return only the expanded text.",
  tone: "You are a writing assistant. Adjust the tone of the following text as requested. Return only the adjusted text.",
  complete: "You are a writing assistant. Continue writing from where the text left off, maintaining the same style and tone. Return only the continuation text.",
};

class AiService {
  async complete(
    orgId: string,
    userId: string,
    input: AiCompleteInput
  ): Promise<{ text: string; jobId: string }> {
    // Create the job record
    const [job] = await db
      .insert(aiJobs)
      .values({
        orgId,
        userId,
        type: input.type,
        input: {
          prompt: input.prompt,
          context: input.context,
          toneStyle: input.toneStyle,
        },
        status: "processing",
      })
      .returning();

    try {
      const systemPrompt = input.toneStyle
        ? `${SYSTEM_PROMPTS[input.type] ?? SYSTEM_PROMPTS.complete} Requested tone: ${input.toneStyle}`
        : SYSTEM_PROMPTS[input.type] ?? SYSTEM_PROMPTS.complete!;

      const userPrompt = input.context
        ? `Context: ${input.context}\n\nText: ${input.prompt}`
        : input.prompt;

      const result = await callLlm(systemPrompt, userPrompt);

      // Update job with result
      await db
        .update(aiJobs)
        .set({
          output: { text: result.text },
          status: "completed",
          model: result.model,
          costTokens: result.tokens,
          completedAt: new Date(),
        })
        .where(eq(aiJobs.id, job!.id));

      return { text: result.text, jobId: job!.id };
    } catch (error) {
      await db
        .update(aiJobs)
        .set({
          status: "failed",
          output: { error: String(error) },
          completedAt: new Date(),
        })
        .where(eq(aiJobs.id, job!.id));

      throw error;
    }
  }

  async getUserUsage(userId: string, orgId: string): Promise<{
    totalJobs: number;
    totalTokens: number;
    monthlyJobs: number;
    monthlyTokens: number;
  }> {
    const [totals] = await db
      .select({
        totalJobs: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${aiJobs.costTokens}), 0)::int`,
      })
      .from(aiJobs)
      .where(and(eq(aiJobs.userId, userId), eq(aiJobs.orgId, orgId)));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [monthly] = await db
      .select({
        monthlyJobs: sql<number>`count(*)::int`,
        monthlyTokens: sql<number>`coalesce(sum(${aiJobs.costTokens}), 0)::int`,
      })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.userId, userId),
          eq(aiJobs.orgId, orgId),
          sql`${aiJobs.createdAt} >= ${monthStart}`
        )
      );

    return {
      totalJobs: totals?.totalJobs ?? 0,
      totalTokens: totals?.totalTokens ?? 0,
      monthlyJobs: monthly?.monthlyJobs ?? 0,
      monthlyTokens: monthly?.monthlyTokens ?? 0,
    };
  }
}

export const aiService = new AiService();
