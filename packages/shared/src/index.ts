// OpenLark Shared Types and Utilities

// Common types
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  domain: string;
  logoUrl?: string;
  plan: "starter" | "pro" | "enterprise";
  createdAt: Date;
  updatedAt: Date;
}

// Utility functions
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function generateId(): string {
  return crypto.randomUUID();
}
