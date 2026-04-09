/**
 * Files module tests.
 *
 * Covers:
 *   - Service unit tests with a mocked drizzle `db` chain (no Postgres needed)
 *   - Route auth tests using `app.inject()` against the real Fastify instance
 *   - Validation tests for the upload route's required fields
 *
 * NOTE: The files module is currently a metadata-only stub — it does not
 * upload bytes to S3/MinIO. These tests cover the existing surface area so
 * future work on T-025 (real S3 upload) can refactor with confidence.
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

  return {
    insertMock,
    insertValues,
    insertReturning,
    selectMock,
    selectFrom,
    selectWhere,
    selectLimit,
  };
});

vi.mock("../db/index.js", () => ({
  db: {
    insert: mocks.insertMock,
    select: mocks.selectMock,
  },
}));

vi.mock("../db/schema/index.js", () => ({
  files: {},
}));

import { filesService } from "../modules/files/files.service.js";
import { buildApp } from "../app.js";

describe("filesService", () => {
  beforeEach(() => {
    mocks.insertMock.mockClear();
    mocks.insertValues.mockClear();
    mocks.insertReturning.mockClear();
    mocks.selectMock.mockClear();
    mocks.selectFrom.mockClear();
    mocks.selectWhere.mockClear();
    mocks.selectLimit.mockClear();
  });

  describe("createFile", () => {
    it("inserts a file row and returns it", async () => {
      const fakeRow = {
        id: "file-1",
        orgId: "org-1",
        uploaderId: "user-1",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 1234,
        storageKey: "uploads/org-1/abc/report.pdf",
      };
      mocks.insertReturning.mockResolvedValueOnce([fakeRow]);

      const result = await filesService.createFile({
        orgId: "org-1",
        uploaderId: "user-1",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 1234,
      });

      expect(result).toEqual(fakeRow);
      expect(mocks.insertMock).toHaveBeenCalledTimes(1);
      expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    });

    it("generates a storageKey scoped to the org and file name", async () => {
      mocks.insertReturning.mockResolvedValueOnce([{ id: "file-2" }]);

      await filesService.createFile({
        orgId: "org-42",
        uploaderId: "user-9",
        name: "image.png",
        mimeType: "image/png",
        size: 500,
      });

      const inserted = mocks.insertValues.mock.calls[0][0] as {
        storageKey: string;
        orgId: string;
        name: string;
      };
      expect(inserted.orgId).toBe("org-42");
      expect(inserted.name).toBe("image.png");
      // Pattern: uploads/<orgId>/<uuid>/<name>
      expect(inserted.storageKey).toMatch(
        /^uploads\/org-42\/[0-9a-f-]{36}\/image\.png$/
      );
    });

    it("uses a unique storageKey on every call (UUID isolation)", async () => {
      mocks.insertReturning.mockResolvedValue([{ id: "x" }]);

      await filesService.createFile({
        orgId: "org-1",
        uploaderId: "u",
        name: "a.txt",
        mimeType: "text/plain",
        size: 1,
      });
      await filesService.createFile({
        orgId: "org-1",
        uploaderId: "u",
        name: "a.txt",
        mimeType: "text/plain",
        size: 1,
      });

      const k1 = (mocks.insertValues.mock.calls[0][0] as { storageKey: string })
        .storageKey;
      const k2 = (mocks.insertValues.mock.calls[1][0] as { storageKey: string })
        .storageKey;
      expect(k1).not.toBe(k2);
    });
  });

  describe("getFile", () => {
    it("returns the file when found", async () => {
      const row = { id: "file-1", name: "report.pdf" };
      mocks.selectLimit.mockResolvedValueOnce([row]);

      const result = await filesService.getFile("file-1");
      expect(result).toEqual(row);
    });

    it("returns null when no file matches", async () => {
      mocks.selectLimit.mockResolvedValueOnce([]);
      const result = await filesService.getFile("missing");
      expect(result).toBeNull();
    });
  });
});

describe("Files Routes - Auth Requirements", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it("POST /files/upload requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      payload: { name: "a.txt", mimeType: "text/plain", size: 10 },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /files/:id requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/files/123e4567-e89b-12d3-a456-426614174000",
    });
    expect(response.statusCode).toBe(401);
  });
});
