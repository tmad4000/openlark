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

export const createOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(255),
  domain: z.string().max(255).optional(),
});

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  logoUrl: z.string().url().nullable().optional(),
  industry: z.string().max(100).optional(),
  settings: z.record(z.unknown()).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
