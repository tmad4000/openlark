// Core entity types shared across OpenLark modules

/** Base entity fields present on all database records */
export interface BaseEntity {
  id: string;
  org_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  created_by: string;
}

/** Pagination parameters for list endpoints */
export interface PaginationParams {
  page: number;
  per_page: number;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

/** Standard API error response */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Standard API success response */
export interface ApiResponse<T> {
  data: T;
}

/** User status enum */
export const UserStatus = {
  ACTIVE: "active",
  DEACTIVATED: "deactivated",
  PENDING: "pending",
} as const;

export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];

/** Permission roles */
export const OrgRole = {
  PRIMARY_ADMIN: "primary_admin",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type OrgRoleType = (typeof OrgRole)[keyof typeof OrgRole];

/** Document permission levels */
export const DocPermission = {
  VIEWER: "viewer",
  EDITOR: "editor",
  MANAGER: "manager",
  OWNER: "owner",
} as const;

export type DocPermissionType =
  (typeof DocPermission)[keyof typeof DocPermission];

/** Utility: generate a cuid-style ID placeholder */
export function createId(): string {
  return crypto.randomUUID();
}

/** Utility: build a paginated response */
export function paginate<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    total,
    page: params.page,
    per_page: params.per_page,
    has_more: params.page * params.per_page < total,
  };
}
