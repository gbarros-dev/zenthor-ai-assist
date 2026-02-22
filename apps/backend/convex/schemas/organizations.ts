import { defineTable } from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";

export const organizationType = v.union(
  v.literal("personal"),
  v.literal("group"),
  v.literal("company"),
);
export type OrganizationType = Infer<typeof organizationType>;

export const organizationsTable = defineTable({
  // Clerk integration
  externalId: v.string(), // Clerk organization ID

  // Basic organization info
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),

  // Organization classification
  organizationType: organizationType,

  // Status
  isActive: v.optional(v.boolean()),

  // Admin organization flag (platform administration)
  isAdmin: v.optional(v.boolean()),

  // Audit fields
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_external_id", ["externalId"])
  .index("by_slug", ["slug"])
  .index("by_type", ["organizationType"])
  .index("by_active", ["isActive"])
  .index("by_admin", ["isAdmin"]);

export type OrganizationsTable = Doc<"organizations">;
