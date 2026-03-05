import { ZodError } from "zod";

/**
 * Format a Zod validation error into a standard API error response.
 * Used across all modules for consistent validation error handling.
 */
export function formatZodError(error: ZodError) {
  return {
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    details: error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    })),
  };
}
