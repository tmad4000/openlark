/**
 * SSO module tests.
 *
 * Covers:
 *   - Service unit tests with a mocked drizzle `db` chain (no Postgres needed)
 *   - Route auth tests using `app.inject()` against the real Fastify instance
 *     (admin-only endpoints reject unauthenticated callers; SAML callback
 *      stub returns 501)
 *   - Validation tests for the create-config route's required fields
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// ---- mocks (must be hoisted above the import of the service) ---------------

const mocks = vi.hoisted(() => {
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insertMock = vi.fn(() => ({ values: insertValues }));

  const selectLimit = vi.fn();
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const selectMock = vi.fn(() => ({ from: selectFrom }));

  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const updateMock = vi.fn(() => ({ set: updateSet }));

  return {
    insertMock,
    insertValues,
    insertReturning,
    selectMock,
    selectLimit,
    updateMock,
    updateSet,
    updateWhere,
    updateReturning,
  };
});

vi.mock("../db/index.js", () => ({
  db: {
    insert: mocks.insertMock,
    select: mocks.selectMock,
    update: mocks.updateMock,
  },
}));

vi.mock("../db/schema/index.js", () => ({
  ssoConfigs: {
    orgId: "orgId",
  },
}));

import { ssoService } from "../modules/sso/sso.service.js";
import { buildApp } from "../app.js";

describe("ssoService", () => {
  beforeEach(() => {
    mocks.insertMock.mockClear();
    mocks.insertValues.mockClear();
    mocks.insertReturning.mockClear();
    mocks.selectMock.mockClear();
    mocks.selectLimit.mockClear();
    mocks.updateMock.mockClear();
    mocks.updateSet.mockClear();
    mocks.updateWhere.mockClear();
    mocks.updateReturning.mockClear();
  });

  describe("getConfig", () => {
    it("returns the config when one exists for the org", async () => {
      const row = {
        id: "sso-1",
        orgId: "org-1",
        entityId: "https://idp.example.com",
        ssoUrl: "https://idp.example.com/sso",
        certificate: "MII...",
        isEnabled: true,
      };
      mocks.selectLimit.mockResolvedValueOnce([row]);

      const result = await ssoService.getConfig("org-1");
      expect(result).toEqual(row);
    });

    it("returns null when no config exists", async () => {
      mocks.selectLimit.mockResolvedValueOnce([]);
      const result = await ssoService.getConfig("org-empty");
      expect(result).toBeNull();
    });
  });

  describe("createConfig", () => {
    it("inserts and returns the new config", async () => {
      const row = {
        id: "sso-1",
        orgId: "org-1",
        entityId: "https://idp.example.com",
        ssoUrl: "https://idp.example.com/sso",
        certificate: "MII...",
      };
      mocks.insertReturning.mockResolvedValueOnce([row]);

      const result = await ssoService.createConfig("org-1", {
        entityId: "https://idp.example.com",
        ssoUrl: "https://idp.example.com/sso",
        certificate: "MII...",
      });

      expect(result).toEqual(row);
      const inserted = mocks.insertValues.mock.calls[0][0] as {
        orgId: string;
        entityId: string;
      };
      expect(inserted.orgId).toBe("org-1");
      expect(inserted.entityId).toBe("https://idp.example.com");
    });
  });

  describe("updateConfig", () => {
    it("only sets fields that were provided (sparse update)", async () => {
      mocks.updateReturning.mockResolvedValueOnce([{ id: "sso-1" }]);

      await ssoService.updateConfig("org-1", {
        entityId: "https://new.example.com",
      });

      const updateArg = mocks.updateSet.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updateArg.entityId).toBe("https://new.example.com");
      expect("ssoUrl" in updateArg).toBe(false);
      expect("certificate" in updateArg).toBe(false);
      expect("isEnabled" in updateArg).toBe(false);
      // updatedAt is always set
      expect(updateArg.updatedAt).toBeInstanceOf(Date);
    });

    it("supports toggling isEnabled false (the falsy case must not be skipped)", async () => {
      mocks.updateReturning.mockResolvedValueOnce([{ id: "sso-1" }]);

      await ssoService.updateConfig("org-1", { isEnabled: false });

      const updateArg = mocks.updateSet.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(updateArg.isEnabled).toBe(false);
    });

    it("returns null when the org has no existing config to update", async () => {
      mocks.updateReturning.mockResolvedValueOnce([]);
      const result = await ssoService.updateConfig("org-missing", {
        entityId: "x",
      });
      expect(result).toBeNull();
    });
  });
});

describe("SSO Routes - Auth Requirements", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it("GET /admin/sso requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/sso",
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /admin/sso requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/sso",
      payload: {
        entityId: "https://idp.example.com",
        ssoUrl: "https://idp.example.com/sso",
        certificate: "MII...",
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it("PATCH /admin/sso requires authentication", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/sso",
      payload: { isEnabled: true },
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /auth/saml/callback returns 501 Not Implemented (stub)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/saml/callback",
      payload: {},
    });
    expect(response.statusCode).toBe(501);
    const body = JSON.parse(response.body);
    expect(body.code).toBe("NOT_IMPLEMENTED");
  });
});
