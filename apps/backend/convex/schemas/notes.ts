import { defineTable } from "convex/server";
import { v } from "convex/values";

export const notesTable = defineTable({
  userId: v.id("users"),
  organizationId: v.id("organizations"),
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  folderId: v.optional(v.id("noteFolders")),
  isPinned: v.boolean(),
  isArchived: v.boolean(),
  source: v.optional(
    v.union(v.literal("manual"), v.literal("chat-generated"), v.literal("imported")),
  ),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_org", ["userId", "organizationId"])
  .index("by_folder", ["folderId"])
  .index("by_user_archived", ["userId", "isArchived"])
  .index("by_user_deleted", ["userId", "deletedAt"]);
