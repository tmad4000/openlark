import { describe, it, expect } from "vitest";
import { loadConfig, validateProductionSecurity } from "../config.js";

describe("config", () => {
  it("loads with default values", () => {
    const cfg = loadConfig();
    expect(cfg.NODE_ENV).toBe("test");
    expect(cfg.PORT).toBe(3001);
    expect(cfg.HOST).toBe("0.0.0.0");
    expect(cfg.DATABASE_URL).toContain("postgres");
    expect(cfg.REDIS_URL).toContain("redis");
    expect(cfg.JWT_SECRET).toBeDefined();
  });

  describe("validateProductionSecurity", () => {
    it("throws when using default JWT_SECRET in production", () => {
      const env = {
        NODE_ENV: "production" as const,
        PORT: 3001,
        HOST: "0.0.0.0",
        DATABASE_URL: "postgres://localhost/test",
        REDIS_URL: "redis://localhost:6379",
        JWT_SECRET: "dev-secret-change-in-production",
        JWT_EXPIRES_IN: "7d",
        S3_ENDPOINT: "http://localhost:9000",
        S3_ACCESS_KEY: "test",
        S3_SECRET_KEY: "test",
        S3_BUCKET: "test",
        MEILI_URL: "http://localhost:7700",
        MEILI_KEY: "test",
      };

      expect(() => validateProductionSecurity(env)).toThrow(
        "SECURITY ERROR: Cannot use default JWT_SECRET in production"
      );
    });

    it("allows default JWT_SECRET in development", () => {
      const env = {
        NODE_ENV: "development" as const,
        PORT: 3001,
        HOST: "0.0.0.0",
        DATABASE_URL: "postgres://localhost/test",
        REDIS_URL: "redis://localhost:6379",
        JWT_SECRET: "dev-secret-change-in-production",
        JWT_EXPIRES_IN: "7d",
        S3_ENDPOINT: "http://localhost:9000",
        S3_ACCESS_KEY: "test",
        S3_SECRET_KEY: "test",
        S3_BUCKET: "test",
        MEILI_URL: "http://localhost:7700",
        MEILI_KEY: "test",
      };

      expect(() => validateProductionSecurity(env)).not.toThrow();
    });

    it("allows default JWT_SECRET in test", () => {
      const env = {
        NODE_ENV: "test" as const,
        PORT: 3001,
        HOST: "0.0.0.0",
        DATABASE_URL: "postgres://localhost/test",
        REDIS_URL: "redis://localhost:6379",
        JWT_SECRET: "dev-secret-change-in-production",
        JWT_EXPIRES_IN: "7d",
        S3_ENDPOINT: "http://localhost:9000",
        S3_ACCESS_KEY: "test",
        S3_SECRET_KEY: "test",
        S3_BUCKET: "test",
        MEILI_URL: "http://localhost:7700",
        MEILI_KEY: "test",
      };

      expect(() => validateProductionSecurity(env)).not.toThrow();
    });

    it("allows custom JWT_SECRET in production", () => {
      const env = {
        NODE_ENV: "production" as const,
        PORT: 3001,
        HOST: "0.0.0.0",
        DATABASE_URL: "postgres://localhost/test",
        REDIS_URL: "redis://localhost:6379",
        JWT_SECRET: "my-secure-production-secret-key-that-is-long-enough",
        JWT_EXPIRES_IN: "7d",
        S3_ENDPOINT: "http://localhost:9000",
        S3_ACCESS_KEY: "test",
        S3_SECRET_KEY: "test",
        S3_BUCKET: "test",
        MEILI_URL: "http://localhost:7700",
        MEILI_KEY: "test",
      };

      expect(() => validateProductionSecurity(env)).not.toThrow();
    });
  });
});
