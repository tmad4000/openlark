import { z } from "zod";

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(["instant", "scheduled", "recurring"]).default("instant"),
  settings: z
    .object({
      muteOnJoin: z.boolean().optional(),
      cameraOffOnJoin: z.boolean().optional(),
      allowScreenShare: z.boolean().optional(),
      maxParticipants: z.number().min(2).max(100).optional(),
    })
    .optional(),
});

export const joinMeetingSchema = z.object({
  // Optional — user identity comes from auth
});

export const startMeetingFromChatSchema = z.object({
  chatId: z.string().uuid(),
  title: z.string().max(255).optional(),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type StartMeetingFromChatInput = z.infer<typeof startMeetingFromChatSchema>;
