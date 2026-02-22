import { defineTable } from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";

export const userRole = v.union(v.literal("admin"), v.literal("system"), v.literal("member"));
export type UserRole = Infer<typeof userRole>;

export const userStatus = v.union(v.literal("active"), v.literal("inactive"));
export type UserStatus = Infer<typeof userStatus>;

export const usersTable = defineTable({
  externalId: v.string(),
  name: v.string(),
  email: v.string(),
  role: v.optional(userRole),
  emailVerified: v.optional(v.boolean()),
  image: v.optional(v.string()),
  phone: v.optional(v.string()),
  status: userStatus,

  // Organization context
  activeOrganizationId: v.optional(v.id("organizations")),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_externalId", ["externalId"])
  .index("by_email", ["email"])
  .index("by_phone", ["phone"]);
