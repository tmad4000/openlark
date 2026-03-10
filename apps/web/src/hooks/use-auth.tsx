"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, ApiError, type User, type Organization } from "@/lib/api";

interface AuthState {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
    orgName: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    organization: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshUser = useCallback(async () => {
    try {
      const token = api.getToken();
      if (!token) {
        setState({
          user: null,
          organization: null,
          isLoading: false,
          isAuthenticated: false,
        });
        return;
      }

      const { user, organization } = await api.me();
      setState({
        user,
        organization,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
      // Only clear token on 401 Unauthorized - the token is definitively invalid
      // Don't clear on network errors, 5xx server errors, etc. - those are temporary
      const isUnauthorized = error instanceof ApiError && error.isUnauthorized();

      if (isUnauthorized) {
        api.setToken(null);
      }

      setState({
        user: null,
        organization: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const { token } = await api.login({ email, password });
    api.setToken(token);
    await refreshUser();
  };

  const register = async (
    email: string,
    password: string,
    displayName: string,
    orgName: string
  ) => {
    const { token } = await api.register({
      email,
      password,
      displayName,
      orgName,
    });
    api.setToken(token);
    await refreshUser();
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore errors, clear local state anyway
    }
    api.setToken(null);
    setState({
      user: null,
      organization: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
