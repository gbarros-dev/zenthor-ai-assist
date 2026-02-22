import { defineTable } from "convex/server";
import { v } from "convex/values";

export const noteFoldersTable = defineTable({
  userId: v.id("users"),
  organizationId: v.id("organizations"),
  name: v.string(),
  color: v.string(),
  position: v.number(),
  parentId: v.optional(v.id("noteFolders")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_org", ["userId", "organizationId"])
  .index("by_parent", ["parentId"]);
