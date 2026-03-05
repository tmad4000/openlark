import { describe, it, expect } from "vitest";
import { loadConfig } from "../config.js";

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
});
