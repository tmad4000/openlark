import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(1234),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .default("postgres://openlark:openlark@localhost:5432/openlark"),
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const env = envSchema.parse(process.env);
  if (env.NODE_ENV === "production" && env.JWT_SECRET === "dev-secret-change-in-production") {
    throw new Error("SECURITY ERROR: Cannot use default JWT_SECRET in production.");
  }
  return env;
}

export const config = loadConfig();
