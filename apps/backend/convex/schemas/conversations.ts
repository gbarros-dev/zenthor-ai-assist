import { defineTable } from "convex/server";
import { v } from "convex/values";

export const conversationsTable = defineTable({
  userId: v.id("users"),
  organizationId: v.id("organizations"),
  channel: v.union(v.literal("web"), v.literal("whatsapp"), v.literal("tui")),
  title: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("archived")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_channel", ["userId", "channel"])
  .index("by_user_status", ["userId", "status"]);
