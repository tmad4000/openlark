import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock api module
const mockApi = {
  getToken: vi.fn(),
  setToken: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

// Create a class that matches the shape of ApiError
class MockApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }
}

// Mock the api module using factory
vi.mock("@/lib/api", () => ({
  api: mockApi,
  ApiError: MockApiError,
}));

// Import after mocks are set up
const { AuthProvider, useAuth } = await import("./use-auth");

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("has correct initial values", () => {
      mockApi.getToken.mockReturnValue(null);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // After render, either loading or not authenticated
      // Due to timing, isLoading may already be false when no token
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it("sets not authenticated when no token", async () => {
      mockApi.getToken.mockReturnValue(null);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe("token refresh on mount", () => {
    it("refreshes user when token exists", async () => {
      mockApi.getToken.mockReturnValue("valid-token");
      mockApi.me.mockResolvedValue({
        user: { id: "1", email: "test@test.com", displayName: "Test", avatarUrl: null, status: "active", orgId: "org1" },
        organization: { id: "org1", name: "Test Org", domain: null, logoUrl: null },
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe("test@test.com");
    });

    it("clears token on 401 Unauthorized", async () => {
      mockApi.getToken.mockReturnValue("invalid-token");
      const error = new MockApiError("Unauthorized", 401, "UNAUTHORIZED");
      mockApi.me.mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockApi.setToken).toHaveBeenCalledWith(null);
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("does NOT clear token on network error", async () => {
      mockApi.getToken.mockReturnValue("valid-token");
      const networkError = new TypeError("Failed to fetch");
      mockApi.me.mockRejectedValue(networkError);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Token should NOT be cleared on network error
      expect(mockApi.setToken).not.toHaveBeenCalledWith(null);
      // Should stay in a non-authenticated but recoverable state
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("does NOT clear token on 500 server error", async () => {
      mockApi.getToken.mockReturnValue("valid-token");
      const serverError = new MockApiError("Internal Server Error", 500, "INTERNAL_ERROR");
      mockApi.me.mockRejectedValue(serverError);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Token should NOT be cleared on server error
      expect(mockApi.setToken).not.toHaveBeenCalledWith(null);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe("login", () => {
    it("calls api.login and refreshes user", async () => {
      mockApi.getToken.mockReturnValue(null);
      mockApi.login.mockResolvedValue({
        token: "new-token",
        user: { id: "1", email: "test@test.com", displayName: "Test", avatarUrl: null, status: "active", orgId: "org1" },
      });
      mockApi.me.mockResolvedValue({
        user: { id: "1", email: "test@test.com", displayName: "Test", avatarUrl: null, status: "active", orgId: "org1" },
        organization: { id: "org1", name: "Test Org", domain: null, logoUrl: null },
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Update getToken to return the new token after login
      mockApi.getToken.mockReturnValue("new-token");

      await act(async () => {
        await result.current.login("test@test.com", "password");
      });

      expect(mockApi.login).toHaveBeenCalledWith({ email: "test@test.com", password: "password" });
      expect(mockApi.setToken).toHaveBeenCalledWith("new-token");
    });
  });

  describe("logout", () => {
    it("clears user state on logout", async () => {
      mockApi.getToken.mockReturnValue("valid-token");
      mockApi.me.mockResolvedValue({
        user: { id: "1", email: "test@test.com", displayName: "Test", avatarUrl: null, status: "active", orgId: "org1" },
        organization: { id: "org1", name: "Test Org", domain: null, logoUrl: null },
      });
      mockApi.logout.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(mockApi.setToken).toHaveBeenCalledWith(null);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });
});
