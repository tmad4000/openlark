import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./api";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};
Object.defineProperty(global, "localStorage", { value: localStorageMock });

describe("ApiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    api.setToken(null);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("token management", () => {
    it("stores token in localStorage", () => {
      api.setToken("test-token");
      expect(localStorageMock.setItem).toHaveBeenCalledWith("auth_token", "test-token");
    });

    it("removes token from localStorage when set to null", () => {
      api.setToken("test-token");
      api.setToken(null);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("auth_token");
    });

    it("retrieves token from localStorage", () => {
      localStorageMock.store["auth_token"] = "stored-token";
      expect(api.getToken()).toBe("stored-token");
    });
  });

  describe("request handling", () => {
    it("throws error with message from API on error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: "Invalid credentials", code: "INVALID_CREDENTIALS" }),
      });

      await expect(api.login({ email: "test@test.com", password: "wrong" }))
        .rejects.toThrow("Invalid credentials");
    });

    it("includes Authorization header when token is set", async () => {
      api.setToken("test-token");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { user: {}, organization: {} } }),
      });

      await api.me();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });
  });

  describe("error types", () => {
    it("preserves 401 error code in message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: "Unauthorized", code: "UNAUTHORIZED" }),
      });

      await expect(api.me()).rejects.toThrow("Unauthorized");
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(api.me()).rejects.toThrow("Failed to fetch");
    });
  });
});
