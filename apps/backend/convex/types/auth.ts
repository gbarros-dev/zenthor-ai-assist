/**
 * Shared authentication types for Webmagister Convex backend
 *
 * Adapted from AgroProj auth types for school management domain
 */

import type { Doc, Id } from "../_generated/dataModel";

// ====================
// USER ROLES & STATUS
// ====================

export type UserRole =
  | "system" // System-level access
  | "admin" // Organization admin
  | "member" // Regular member
  | "viewer"; // Read-only access

export type UserStatus =
  | "active" // Active user
  | "inactive" // Inactive user
  | "suspended" // Suspended user
  | "pending"; // Pending activation

export type OrganizationRole =
  | "owner" // Organization owner
  | "admin" // Organization admin
  | "member"; // Organization member

export type OrganizationType =
  | "personal" // Personal organization
  | "group" // Group organization
  | "company"; // Company organization

// ====================
// AUTH CONTEXT
// ====================

/**
 * Base user interface with common fields
 */
export interface BaseUser {
  id: Id<"users">;
  organizationId: Id<"organizations">;
  role: UserRole;
  status: UserStatus;
  permissions: string[];
}

/**
 * Convex authentication context
 */
export interface AuthContext extends BaseUser {
  userId: Id<"users">;
  organizationId: Id<"organizations">;
  externalId: string; // Clerk user ID
  email?: string;

  // Admin organization flag
  isAdminOrganization: boolean;

  // Include full user document and membership for common use cases
  user: Doc<"users">;
  membership: Doc<"organization_members"> | null;

  // Permission and role checking utilities
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
  canAccessOrganization: (orgId: string) => boolean;
  validateOrganizationAccess: (targetOrgId: string) => void;
}

// ====================
// PERMISSION CONSTANTS
// ====================

/**
 * Webmagister permissions for school management
 */
export const PERMISSIONS = {
  // User management
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  USERS_DELETE: "users:delete",

  // Organization management
  ORGANIZATIONS_READ: "organizations:read",
  ORGANIZATIONS_WRITE: "organizations:write",
  ORGANIZATIONS_ADMIN: "organizations:admin",

  // System administration
  SYSTEM_ADMIN: "system:admin",
  SYSTEM_CONFIG: "system:config",
};

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ====================
// ERROR TYPES
// ====================

export const AUTH_ERRORS = {
  NO_IDENTITY: "NO_IDENTITY",
  NO_USER_RECORD: "NO_USER_RECORD",
  NO_ORGANIZATION: "NO_ORGANIZATION",
  INSUFFICIENT_ROLE: "INSUFFICIENT_ROLE",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
  WRONG_ORGANIZATION: "WRONG_ORGANIZATION",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_PENDING: "ACCOUNT_PENDING",
  ACCOUNT_BLOCKED: "ACCOUNT_BLOCKED",
} as const;

export type AuthErrorType = (typeof AUTH_ERRORS)[keyof typeof AUTH_ERRORS];

export interface AuthError {
  type: AuthErrorType;
  message: string;
  details?: Record<string, unknown>;
}

// ====================
// VALIDATION HELPERS
// ====================

/**
 * Check if user account is valid and active
 */
export function isAccountValid(user: BaseUser): boolean {
  return user.status === "active";
}

/**
 * Check if user has specific role
 */
export function hasRole(user: BaseUser, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    viewer: 0,
    member: 1,
    admin: 2,
    system: 3,
  };

  return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
}

/**
 * Check if user has specific permission
 */
export function hasPermission(user: BaseUser, permission: string): boolean {
  // System and admin roles have all permissions
  if (user.role === "system" || user.role === "admin") {
    return true;
  }

  return user.permissions.includes(permission);
}

/**
 * Get effective permissions for a user based on role and explicit permissions.
 * When isAdminOrganization is true and user has admin/owner org role, grant all permissions.
 */
export function getEffectivePermissions(
  user: BaseUser,
  options?: { isAdminOrganization?: boolean },
): string[] {
  if (options?.isAdminOrganization && (user.role === "admin" || user.role === "system")) {
    return Object.values(PERMISSIONS);
  }
  const rolePermissions: Record<UserRole, string[]> = {
    system: Object.values(PERMISSIONS),
    admin: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_WRITE,
      PERMISSIONS.ORGANIZATIONS_READ,
      PERMISSIONS.ORGANIZATIONS_WRITE,
    ],
    member: [],
    viewer: [],
  };

  const basePermissions = rolePermissions[user.role] || [];
  const combinedPermissions = [...new Set([...basePermissions, ...user.permissions])];

  return combinedPermissions;
}
