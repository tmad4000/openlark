/**
 * Files module tests.
 *
 * Covers:
 *   - Service unit tests with mocked drizzle `db` and S3 client
 *   - Route auth tests using `app.inject()`
 *   - Multipart upload validation (mime type, file size)
 *   - Download URL generation
 *   - File deletion
 *   - Org-level access control
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

  const deleteMock = vi.fn();
  const deleteWhere = vi.fn();
  deleteMock.mockReturnValue({ where: deleteWhere });

  const uploadToS3 = vi.fn().mockResolvedValue(undefined);
  const getPresignedDownloadUrl = vi.fn().mockResolvedValue("https://s3.example.com/presigned-url");
  const deleteFromS3 = vi.fn().mockResolvedValue(undefined);

  return {
    insertMock,
    insertValues,
    insertReturning,
    selectMock,
    selectFrom,
    selectWhere,
    selectLimit,
    deleteMock,
    deleteWhere,
    uploadToS3,
    getPresignedDownloadUrl,
    deleteFromS3,
  };
});

vi.mock("../db/index.js", () => ({
  db: {
    insert: mocks.insertMock,
    select: mocks.selectMock,
    delete: mocks.deleteMock,
  },
}));

vi.mock("../db/schema/index.js", () => ({
  files: {},
}));

vi.mock("../modules/files/s3.js", () => ({
  uploadToS3: mocks.uploadToS3,
  getPresignedDownloadUrl: mocks.getPresignedDownloadUrl,
  deleteFromS3: mocks.deleteFromS3,
  ensureBucket: vi.fn().mockResolvedValue(undefined),
  getS3Client: vi.fn(),
}));

import { filesService } from "../modules/files/files.service.js";
import { buildApp } from "../app.js";

describe("filesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createFile", () => {
    it("uploads to S3 and inserts a file row", async () => {
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

      const buffer = Buffer.from("fake pdf content");
      const result = await filesService.createFile({
        orgId: "org-1",
        uploaderId: "user-1",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 1234,
        buffer,
      });

      expect(result).toEqual(fakeRow);
      expect(mocks.uploadToS3).toHaveBeenCalledTimes(1);
      expect(mocks.uploadToS3).toHaveBeenCalledWith(
        expect.stringMatching(/^uploads\/org-1\/[0-9a-f-]{36}\/report\.pdf$/),
        buffer,
        "application/pdf",
      );
      expect(mocks.insertMock).toHaveBeenCalledTimes(1);
    });

    it("generates a storageKey scoped to the org and file name", async () => {
      mocks.insertReturning.mockResolvedValueOnce([{ id: "file-2" }]);

      await filesService.createFile({
        orgId: "org-42",
        uploaderId: "user-9",
        name: "image.png",
        mimeType: "image/png",
        size: 500,
        buffer: Buffer.from("fake"),
      });

      const inserted = mocks.insertValues.mock.calls[0][0] as {
        storageKey: string;
        orgId: string;
        name: string;
      };
      expect(inserted.orgId).toBe("org-42");
      expect(inserted.name).toBe("image.png");
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
        buffer: Buffer.from("a"),
      });
      await filesService.createFile({
        orgId: "org-1",
        uploaderId: "u",
        name: "a.txt",
        mimeType: "text/plain",
        size: 1,
        buffer: Buffer.from("a"),
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

  describe("getDownloadUrl", () => {
    it("returns presigned URL for existing file", async () => {
      const row = { id: "file-1", storageKey: "uploads/org-1/abc/report.pdf" };
      mocks.selectLimit.mockResolvedValueOnce([row]);

      const url = await filesService.getDownloadUrl("file-1");
      expect(url).toBe("https://s3.example.com/presigned-url");
      expect(mocks.getPresignedDownloadUrl).toHaveBeenCalledWith("uploads/org-1/abc/report.pdf");
    });

    it("returns null for non-existent file", async () => {
      mocks.selectLimit.mockResolvedValueOnce([]);
      const url = await filesService.getDownloadUrl("missing");
      expect(url).toBeNull();
    });
  });

  describe("deleteFile", () => {
    it("deletes from S3 and database", async () => {
      const row = { id: "file-1", orgId: "org-1", storageKey: "uploads/org-1/abc/report.pdf" };
      mocks.selectLimit.mockResolvedValueOnce([row]);

      const result = await filesService.deleteFile("file-1", "org-1");
      expect(result).toBe(true);
      expect(mocks.deleteFromS3).toHaveBeenCalledWith("uploads/org-1/abc/report.pdf");
      expect(mocks.deleteMock).toHaveBeenCalledTimes(1);
    });

    it("returns false for non-existent file", async () => {
      mocks.selectLimit.mockResolvedValueOnce([]);
      const result = await filesService.deleteFile("missing", "org-1");
      expect(result).toBe(false);
    });

    it("returns false when org does not match", async () => {
      const row = { id: "file-1", orgId: "org-1", storageKey: "key" };
      mocks.selectLimit.mockResolvedValueOnce([row]);

      const result = await filesService.deleteFile("file-1", "org-other");
      expect(result).toBe(false);
      expect(mocks.deleteFromS3).not.toHaveBeenCalled();
    });
  });

  describe("validateMimeType", () => {
    it("accepts common file types", () => {
      expect(filesService.validateMimeType("image/png")).toBe(true);
      expect(filesService.validateMimeType("application/pdf")).toBe(true);
      expect(filesService.validateMimeType("text/plain")).toBe(true);
    });

    it("rejects unknown mime types", () => {
      expect(filesService.validateMimeType("application/x-executable")).toBe(false);
      expect(filesService.validateMimeType("text/html")).toBe(false);
    });
  });

  describe("validateFileSize", () => {
    it("accepts valid file sizes", () => {
      expect(filesService.validateFileSize(1)).toBe(true);
      expect(filesService.validateFileSize(1024 * 1024)).toBe(true);
    });

    it("rejects zero or negative size", () => {
      expect(filesService.validateFileSize(0)).toBe(false);
      expect(filesService.validateFileSize(-1)).toBe(false);
    });

    it("rejects files over 50 MB", () => {
      expect(filesService.validateFileSize(50 * 1024 * 1024 + 1)).toBe(false);
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
      payload: "dummy",
      headers: { "content-type": "multipart/form-data; boundary=----test" },
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

  it("GET /files/:id/download requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/files/123e4567-e89b-12d3-a456-426614174000/download",
    });
    expect(response.statusCode).toBe(401);
  });

  it("DELETE /files/:id requires authentication", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/files/123e4567-e89b-12d3-a456-426614174000",
    });
    expect(response.statusCode).toBe(401);
  });
});
