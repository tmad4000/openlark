import { z } from "zod";

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
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // MinIO / S3
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_ACCESS_KEY: z.string().default("openlark"),
  S3_SECRET_KEY: z.string().default("openlark123"),
  S3_BUCKET: z.string().default("openlark"),

  // Meilisearch
  MEILI_URL: z.string().default("http://localhost:7700"),
  MEILI_KEY: z.string().default("openlark-dev-key"),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  return envSchema.parse(process.env);
}

export const config = loadConfig();
