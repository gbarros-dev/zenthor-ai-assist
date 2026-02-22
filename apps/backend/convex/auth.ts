/**
 * Webmagister Convex Authentication
 *
 * Authentication utilities for Convex functions
 * Provides role-based access control and multi-tenancy for school management
 */

import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import {
  AUTH_ERRORS,
  type AuthContext,
  type AuthErrorType,
  type BaseUser,
  getEffectivePermissions,
  hasPermission,
  hasRole,
  isAccountValid,
  PERMISSIONS,
  type UserRole,
  type UserStatus,
} from "./types/auth";

// ====================
// ERROR HANDLING
// ====================

function createAuthError(
  type: AuthErrorType,
  message?: string,
  details?: Record<string, unknown>,
): ConvexError<string> {
  const errorMessages: Record<AuthErrorType, string> = {
    [AUTH_ERRORS.NO_IDENTITY]: "Usuário não autenticado",
    [AUTH_ERRORS.NO_USER_RECORD]: "Registro de usuário não encontrado",
    [AUTH_ERRORS.NO_ORGANIZATION]: "Nenhuma organização encontrada",
    [AUTH_ERRORS.INSUFFICIENT_ROLE]: "Permissões insuficientes para esta ação",
    [AUTH_ERRORS.INSUFFICIENT_PERMISSIONS]: "Permissões específicas insuficientes",
    [AUTH_ERRORS.WRONG_ORGANIZATION]: "Acesso negado para esta organização",
    [AUTH_ERRORS.ACCOUNT_INACTIVE]: "Conta inativa",
    [AUTH_ERRORS.ACCOUNT_SUSPENDED]: "Conta suspensa",
    [AUTH_ERRORS.ACCOUNT_PENDING]: "Conta pendente de ativação",
    [AUTH_ERRORS.ACCOUNT_BLOCKED]: "Conta bloqueada",
  };

  const defaultMessage = errorMessages[type] || "Erro de autenticação";
  const errorMessage = message || defaultMessage;

  if (type !== AUTH_ERRORS.NO_IDENTITY) {
    console.error(`Auth Error [${type}]:`, errorMessage, details);
  }

  return new ConvexError(
    `[${type}] ${errorMessage}${details ? ` | ${JSON.stringify(details)}` : ""}`,
  );
}

function getStatusErrorType(status: UserStatus): AuthErrorType {
  switch (status) {
    case "inactive":
      return AUTH_ERRORS.ACCOUNT_INACTIVE;
    case "suspended":
      return AUTH_ERRORS.ACCOUNT_SUSPENDED;
    case "pending":
      return AUTH_ERRORS.ACCOUNT_PENDING;
    default:
      return AUTH_ERRORS.ACCOUNT_INACTIVE;
  }
}

// ====================
// CORE AUTH CONTEXT
// ====================

/**
 * Get authenticated user context from Convex
 */
export async function getAuthContext(
  ctx: QueryCtx | MutationCtx,
  targetOrganizationId?: Id<"organizations">,
): Promise<AuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw createAuthError(AUTH_ERRORS.NO_IDENTITY);
  }

  const externalId = identity.subject;

  const user = await ctx.db
    .query("users")
    .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
    .first();

  if (!user) {
    throw createAuthError(AUTH_ERRORS.NO_USER_RECORD, undefined, {
      externalId,
    });
  }

  let membership: Doc<"organization_members"> | null = null;
  let organizationId: Id<"organizations">;

  if (targetOrganizationId) {
    organizationId = targetOrganizationId;

    membership = await ctx.db
      .query("organization_members")
      .withIndex("by_user_organization", (q) =>
        q.eq("userId", user._id).eq("organizationId", targetOrganizationId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    const hasSystemAccess = user.role === "admin" || user.role === "system";

    if (!membership && !hasSystemAccess) {
      throw createAuthError(AUTH_ERRORS.NO_ORGANIZATION, undefined, {
        userId: user._id,
        organizationId: targetOrganizationId,
      });
    }
  } else {
    let activeOrganizationId = user.activeOrganizationId;

    if (!activeOrganizationId) {
      const firstMembership = await ctx.db
        .query("organization_members")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      if (firstMembership) {
        activeOrganizationId = firstMembership.organizationId;
      } else {
        const hasSystemAccess = user.role === "admin" || user.role === "system";

        if (hasSystemAccess) {
          const firstOrg = await ctx.db
            .query("organizations")
            .filter((q) => q.eq(q.field("isActive"), true))
            .first();

          if (firstOrg) {
            activeOrganizationId = firstOrg._id;
          }
        }

        if (!activeOrganizationId) {
          throw createAuthError(AUTH_ERRORS.NO_ORGANIZATION, undefined, {
            userId: user._id,
            message: "Nenhuma organização ativa encontrada para o usuário",
          });
        }
      }
    }

    organizationId = activeOrganizationId;

    membership = await ctx.db
      .query("organization_members")
      .withIndex("by_user_organization", (q) =>
        q.eq("userId", user._id).eq("organizationId", organizationId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
  }

  const organization = await ctx.db.get(organizationId);
  if (!organization) {
    throw createAuthError(AUTH_ERRORS.NO_ORGANIZATION, undefined, {
      userId: user._id,
      organizationId,
    });
  }

  const isAdminOrganization = organization.isAdmin === true;

  const hasSystemAccess = user.role === "admin" || user.role === "system";

  const orgRole = membership ? membership.role : hasSystemAccess ? "admin" : "member";

  const status = membership ? (membership.status as UserStatus) : (user.status as UserStatus);

  const permissions = membership ? membership.permissions || [] : [];

  const mapOrgRoleToUserRole = (role: string): UserRole => {
    switch (role) {
      case "owner":
        return "admin";
      case "admin":
        return "admin";
      case "member":
        return "member";
      default:
        return "viewer";
    }
  };

  let userRole = mapOrgRoleToUserRole(orgRole);

  if (user.role === "system") {
    userRole = "system";
  } else if (user.role === "admin") {
    userRole = "admin";
  }

  // Elevate admin-org admins/owners to system role
  if (isAdminOrganization && (orgRole === "owner" || orgRole === "admin")) {
    userRole = "system";
  }

  const baseUser: BaseUser = {
    id: user._id,
    organizationId,
    role: userRole,
    status,
    permissions: getEffectivePermissions(
      {
        id: user._id,
        organizationId,
        role: userRole,
        status,
        permissions,
      },
      { isAdminOrganization },
    ),
  };

  if (!isAccountValid(baseUser)) {
    const errorType = getStatusErrorType(baseUser.status);
    throw createAuthError(errorType, undefined, {
      userId: user._id,
      status: baseUser.status,
    });
  }

  return {
    ...baseUser,
    userId: user._id,
    organizationId,
    externalId,
    email: identity.email,
    isAdminOrganization,

    user,
    membership,

    hasPermission: (permission: string) => hasPermission(baseUser, permission),
    hasRole: (role: UserRole) => hasRole(baseUser, role),

    canAccessOrganization: (orgId: string) => {
      if (userRole === "system" || userRole === "admin" || hasSystemAccess) {
        return true;
      }
      return orgId === organizationId.toString();
    },

    validateOrganizationAccess: (targetOrgId: string) => {
      if (!baseUser.role || baseUser.role === "viewer") {
        throw createAuthError(AUTH_ERRORS.INSUFFICIENT_ROLE, undefined, {
          userId: user._id,
          userRole: baseUser.role,
          requiredRole: "member",
        });
      }

      if (
        userRole !== "system" &&
        userRole !== "admin" &&
        !hasSystemAccess &&
        targetOrgId !== organizationId.toString()
      ) {
        throw createAuthError(AUTH_ERRORS.WRONG_ORGANIZATION, undefined, {
          userId: user._id,
          userOrgId: organizationId,
          targetOrgId,
        });
      }
    },
  };
}

// ====================
// AUTH WRAPPERS
// ====================

export const authQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const auth = await getAuthContext(ctx);
    return { auth };
  }),
);

export const authMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const auth = await getAuthContext(ctx);
    return { auth };
  }),
);

export const adminQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const auth = await getAuthContext(ctx);

    if (!auth.hasRole("admin")) {
      throw createAuthError(AUTH_ERRORS.INSUFFICIENT_ROLE, undefined, {
        userId: auth.userId,
        userRole: auth.role,
        requiredRole: "admin",
      });
    }

    return { auth };
  }),
);

export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const auth = await getAuthContext(ctx);

    if (!auth.hasRole("admin")) {
      throw createAuthError(AUTH_ERRORS.INSUFFICIENT_ROLE, undefined, {
        userId: auth.userId,
        userRole: auth.role,
        requiredRole: "admin",
      });
    }

    return { auth };
  }),
);

export const permissionQuery = (requiredPermission: string) =>
  customQuery(
    query,
    customCtx(async (ctx) => {
      const auth = await getAuthContext(ctx);

      if (auth.hasRole("admin") || auth.hasRole("system")) {
        return { auth };
      }

      if (!auth.hasPermission(requiredPermission)) {
        throw createAuthError(AUTH_ERRORS.INSUFFICIENT_PERMISSIONS, undefined, {
          userId: auth.userId,
          userRole: auth.role,
          requiredPermission,
          userPermissions: auth.permissions,
        });
      }

      return { auth };
    }),
  );

export const permissionMutation = (requiredPermission: string) =>
  customMutation(
    mutation,
    customCtx(async (ctx) => {
      const auth = await getAuthContext(ctx);

      if (auth.hasRole("admin") || auth.hasRole("system")) {
        return { auth };
      }

      if (!auth.hasPermission(requiredPermission)) {
        throw createAuthError(AUTH_ERRORS.INSUFFICIENT_PERMISSIONS, undefined, {
          userId: auth.userId,
          userRole: auth.role,
          requiredPermission,
          userPermissions: auth.permissions,
        });
      }

      return { auth };
    }),
  );

export const roleQuery = (requiredRole: UserRole) =>
  customQuery(
    query,
    customCtx(async (ctx) => {
      const auth = await getAuthContext(ctx);

      if (!auth.hasRole(requiredRole)) {
        throw createAuthError(AUTH_ERRORS.INSUFFICIENT_ROLE, undefined, {
          userId: auth.userId,
          userRole: auth.role,
          requiredRole,
        });
      }

      return { auth };
    }),
  );

export const roleMutation = (requiredRole: UserRole) =>
  customMutation(
    mutation,
    customCtx(async (ctx) => {
      const auth = await getAuthContext(ctx);

      if (!auth.hasRole(requiredRole)) {
        throw createAuthError(AUTH_ERRORS.INSUFFICIENT_ROLE, undefined, {
          userId: auth.userId,
          userRole: auth.role,
          requiredRole,
        });
      }

      return { auth };
    }),
  );

// ====================
// SYSTEM ADMIN WRAPPERS
// ====================

export const systemAdminQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const auth = await getAuthContext(ctx);

    if (!auth.hasPermission(PERMISSIONS.SYSTEM_ADMIN)) {
      throw createAuthError(AUTH_ERRORS.INSUFFICIENT_PERMISSIONS, undefined, {
        userId: auth.userId,
        requiredPermission: PERMISSIONS.SYSTEM_ADMIN,
      });
    }

    return { auth };
  }),
);

export const systemAdminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const auth = await getAuthContext(ctx);

    if (!auth.hasPermission(PERMISSIONS.SYSTEM_ADMIN)) {
      throw createAuthError(AUTH_ERRORS.INSUFFICIENT_PERMISSIONS, undefined, {
        userId: auth.userId,
        requiredPermission: PERMISSIONS.SYSTEM_ADMIN,
      });
    }

    return { auth };
  }),
);

// Export for use in actions that need manual auth checks
export { createAuthError };

// Re-export permissions for convenience
export { PERMISSIONS } from "./types/auth";

// ====================
// UTILITY FUNCTIONS
// ====================

/**
 * Webmagister-specific auth utilities
 */
export const WebmagisterAuthUtils = {
  validateOrganizationAccess(auth: AuthContext, targetOrgId: string): void {
    if (!auth.canAccessOrganization(targetOrgId)) {
      throw createAuthError(AUTH_ERRORS.WRONG_ORGANIZATION, undefined, {
        userId: auth.userId,
        userOrgId: auth.organizationId,
        targetOrgId,
      });
    }
  },

  canManageUser(auth: AuthContext, targetUserRole: UserRole): boolean {
    return auth.hasRole("admin") || (auth.hasRole("member") && targetUserRole === "viewer");
  },
};
