/**
 * Status service unit tests.
 *
 * Mocks Redis and the database so the test exercises the service's branching
 * logic without external dependencies. The Redis mock is a simple in-memory
 * Map that supports the subset of commands the service uses (`get`, `set` with
 * optional `EX <ttl>`, `del`).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// All shared state for the mocks lives inside vi.hoisted so vitest can hoist
// it above the vi.mock() factory calls.
const mocks = vi.hoisted(() => {
  interface FakeEntry {
    value: string;
    expiresAt: number | null;
  }
  const fakeStore = new Map<string, FakeEntry>();

  const fakeGet = (key: string): string | null => {
    const entry = fakeStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      fakeStore.delete(key);
      return null;
    }
    return entry.value;
  };

  const fakeSet = (key: string, value: string, ...args: unknown[]): "OK" => {
    let expiresAt: number | null = null;
    if (args.length >= 2 && args[0] === "EX" && typeof args[1] === "number") {
      expiresAt = Date.now() + args[1] * 1000;
    }
    fakeStore.set(key, { value, expiresAt });
    return "OK";
  };

  const fakeDel = (key: string): number => {
    return fakeStore.delete(key) ? 1 : 0;
  };

  return {
    fakeStore,
    fakeGet,
    fakeSet,
    fakeDel,
    dbUpdateMock: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
  };
});

vi.mock("../redis.js", () => ({
  redis: {
    get: vi.fn(async (key: string) => mocks.fakeGet(key)),
    set: vi.fn(async (key: string, value: string, ...rest: unknown[]) =>
      mocks.fakeSet(key, value, ...rest)
    ),
    del: vi.fn(async (key: string) => mocks.fakeDel(key)),
  },
}));

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            { workingHoursStart: "09:00", workingHoursEnd: "17:00" },
          ]),
        })),
      })),
    })),
    update: mocks.dbUpdateMock,
  },
}));

// Mock the schema barrel so the service's import doesn't try to load drizzle.
vi.mock("../db/schema/index.js", () => ({
  users: {},
}));

const { fakeStore, dbUpdateMock } = mocks;

// Schema-only import path used inside the service for `eq()` — it's a real
// drizzle import we leave alone, but the where clause builder doesn't need to
// produce anything sensible since our `db.select()` chain ignores it.

// ---- import service after mocks are wired ----------------------------------

import { statusService } from "../modules/status/status.service.js";

describe("statusService", () => {
  beforeEach(() => {
    fakeStore.clear();
    dbUpdateMock.mockClear();
  });

  describe("getStatus", () => {
    it("returns empty custom status with default working hours when nothing is set", async () => {
      const status = await statusService.getStatus("user-1");
      expect(status).toEqual({
        emoji: null,
        text: null,
        expiresAt: null,
        workingHoursStart: "09:00",
        workingHoursEnd: "17:00",
      });
    });
  });

  describe("setStatus", () => {
    it("persists emoji + text without expiry as a Redis key with no TTL", async () => {
      await statusService.setStatus("user-1", {
        emoji: ":coffee:",
        text: "On break",
      });

      const entry = fakeStore.get("user:status:user-1");
      expect(entry).toBeDefined();
      expect(entry!.expiresAt).toBeNull();
      const parsed = JSON.parse(entry!.value);
      expect(parsed).toEqual({
        emoji: ":coffee:",
        text: "On break",
        expiresAt: null,
      });
    });

    it("returns the merged status (custom + working hours)", async () => {
      const status = await statusService.setStatus("user-1", {
        emoji: ":wave:",
        text: "Hello",
      });
      expect(status.emoji).toBe(":wave:");
      expect(status.text).toBe("Hello");
      expect(status.workingHoursStart).toBe("09:00");
    });

    it("writes a TTL to Redis matching expiresAt", async () => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      await statusService.setStatus("user-2", {
        emoji: ":timer:",
        text: "BRB",
        expiresAt,
      });

      const entry = fakeStore.get("user:status:user-2");
      expect(entry).toBeDefined();
      expect(entry!.expiresAt).not.toBeNull();
      // TTL should be roughly 60 seconds in the future (allow a small range).
      const remainingMs = entry!.expiresAt! - Date.now();
      expect(remainingMs).toBeGreaterThan(50_000);
      expect(remainingMs).toBeLessThanOrEqual(60_000);
    });

    it("merges with existing status — setting emoji alone preserves text and expiresAt", async () => {
      const expiresAt = new Date(Date.now() + 120_000).toISOString();
      await statusService.setStatus("user-3", {
        emoji: ":coffee:",
        text: "Break",
        expiresAt,
      });

      await statusService.setStatus("user-3", { emoji: ":wave:" });

      const entry = fakeStore.get("user:status:user-3");
      expect(entry).toBeDefined();
      const parsed = JSON.parse(entry!.value);
      expect(parsed.emoji).toBe(":wave:");
      expect(parsed.text).toBe("Break");
      expect(parsed.expiresAt).toBe(expiresAt);
    });

    it("clearing all custom fields deletes the Redis key", async () => {
      await statusService.setStatus("user-4", {
        emoji: ":coffee:",
        text: "Break",
      });
      expect(fakeStore.has("user:status:user-4")).toBe(true);

      await statusService.setStatus("user-4", { emoji: "", text: "" });
      expect(fakeStore.has("user:status:user-4")).toBe(false);
    });

    it("setting a past expiresAt deletes the key (treated as cleared)", async () => {
      const past = new Date(Date.now() - 1000).toISOString();
      await statusService.setStatus("user-5", {
        emoji: ":coffee:",
        text: "Break",
        expiresAt: past,
      });
      expect(fakeStore.has("user:status:user-5")).toBe(false);
    });

    it("expired entries are returned as cleared and the key is deleted", async () => {
      // Manually plant an entry that says it expires in the past.
      fakeStore.set("user:status:user-6", {
        value: JSON.stringify({
          emoji: ":x:",
          text: "Old",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
        expiresAt: null, // bypass mock TTL so we can observe service behavior
      });

      const status = await statusService.getStatus("user-6");
      expect(status.emoji).toBeNull();
      expect(status.text).toBeNull();
      expect(status.expiresAt).toBeNull();
      expect(fakeStore.has("user:status:user-6")).toBe(false);
    });

    it("corrupt JSON entries are treated as cleared and removed", async () => {
      fakeStore.set("user:status:user-7", {
        value: "not-json{",
        expiresAt: null,
      });

      const status = await statusService.getStatus("user-7");
      expect(status.emoji).toBeNull();
      expect(fakeStore.has("user:status:user-7")).toBe(false);
    });

    it("only updates working hours in DB when provided", async () => {
      await statusService.setStatus("user-8", { emoji: ":coffee:" });
      expect(dbUpdateMock).not.toHaveBeenCalled();

      await statusService.setStatus("user-8", { workingHoursStart: "10:00" });
      expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("status for one user is isolated from another (no cross-talk)", async () => {
      await statusService.setStatus("user-a", {
        emoji: ":a:",
        text: "Alpha",
      });
      await statusService.setStatus("user-b", {
        emoji: ":b:",
        text: "Beta",
      });

      const a = await statusService.getStatus("user-a");
      const b = await statusService.getStatus("user-b");
      expect(a.emoji).toBe(":a:");
      expect(b.emoji).toBe(":b:");
    });
  });
});
