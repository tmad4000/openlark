import { z } from "zod";

const DEFAULT_JWT_SECRET = "dev-secret-change-in-production";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),

  // PostgreSQL
  DATABASE_URL: z
    .string()
    .default("postgres://openlark:openlark@localhost:5432/openlark"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // JWT
  JWT_SECRET: z.string().default(DEFAULT_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // MinIO / S3
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_ACCESS_KEY: z.string().default("openlark"),
  S3_SECRET_KEY: z.string().default("openlark123"),
  S3_BUCKET: z.string().default("openlark"),

  // Meilisearch
  MEILI_URL: z.string().default("http://localhost:7700"),
  MEILI_KEY: z.string().default("openlark-dev-key"),

  // Hocuspocus (collaboration server)
  HOCUSPOCUS_PORT: z.coerce.number().default(1234),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate production security requirements.
 * Throws an error if running in production with insecure defaults.
 */
export function validateProductionSecurity(env: Env): void {
  if (env.NODE_ENV === "production") {
    if (env.JWT_SECRET === DEFAULT_JWT_SECRET) {
      throw new Error(
        "SECURITY ERROR: Cannot use default JWT_SECRET in production. " +
          "Set JWT_SECRET environment variable to a secure random value."
      );
    }
  }
}

export function loadConfig(): Env {
  const env = envSchema.parse(process.env);
  validateProductionSecurity(env);
  return env;
}

export const config = loadConfig();
