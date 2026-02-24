import { defineTable } from "convex/server";
import { v } from "convex/values";

export const messagesTable = defineTable({
  conversationId: v.id("conversations"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  streaming: v.optional(v.boolean()),
  status: v.union(v.literal("sent"), v.literal("pending"), v.literal("failed")),
  modelUsed: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_conversation", ["conversationId"])
  .index("by_conversation_created", ["conversationId", "createdAt"]);
