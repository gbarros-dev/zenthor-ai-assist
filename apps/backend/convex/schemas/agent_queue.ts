import { defineTable } from "convex/server";
import { v } from "convex/values";

export const agentQueueTable = defineTable({
  messageId: v.id("messages"),
  conversationId: v.id("conversations"),
  assistantMessageId: v.optional(v.id("messages")),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  workerId: v.optional(v.string()),
  attempts: v.optional(v.number()),
  modelUsed: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
})
  .index("by_status", ["status"])
  .index("by_conversation", ["conversationId"]);
