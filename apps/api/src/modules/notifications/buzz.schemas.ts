import { z } from "zod";

export const createBuzzSchema = z.object({
  recipient_id: z.string().uuid(),
  type: z.enum(["in_app", "sms", "phone"]),
});

export const buzzMessageParamsSchema = z.object({
  messageId: z.string().uuid(),
});

export type CreateBuzzInput = z.infer<typeof createBuzzSchema>;
