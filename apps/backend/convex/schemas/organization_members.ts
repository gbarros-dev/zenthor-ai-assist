import { defineTable } from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";

export const organizationMemberRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);
export type OrganizationMemberRole = Infer<typeof organizationMemberRole>;

export const organizationMemberStatus = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("pending"),
  v.literal("suspended"),
);
export type OrganizationMemberStatus = Infer<typeof organizationMemberStatus>;

export const organizationMembersTable = defineTable({
  // Clerk integration
  externalId: v.string(), // Clerk membership ID

  // Relationships
  organizationId: v.id("organizations"),
  userId: v.id("users"),

  // Role and permissions
  role: organizationMemberRole,
  status: organizationMemberStatus,
  permissions: v.optional(v.array(v.string())),

  // Audit fields
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_external_id", ["externalId"])
  .index("by_organization", ["organizationId"])
  .index("by_user", ["userId"])
  .index("by_user_organization", ["userId", "organizationId"])
  .index("by_role", ["role"])
  .index("by_status", ["status"])
  .index("by_organization_status", ["organizationId", "status"]);

export type OrganizationMembersTable = Doc<"organization_members">;
