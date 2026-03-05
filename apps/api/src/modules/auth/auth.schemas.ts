import { z } from "zod";

// Password must be at least 8 characters with at least one uppercase,
// one lowercase, one number
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: passwordSchema,
  displayName: z.string().min(1).max(255).optional(),
  orgName: z.string().min(1, "Organization name is required").max(255),
  orgDomain: z.string().max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
