import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { authMutation, authQuery } from "./auth";

export const send = authMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== ctx.auth.userId) {
      throw new ConvexError("Conversation not found");
    }

    const now = Date.now();

    // Auto-title from first message
    if (!conversation.title) {
      const title = args.content.slice(0, 80) + (args.content.length > 80 ? "..." : "");
      await ctx.db.patch(args.conversationId, { title, updatedAt: now });
    } else {
      await ctx.db.patch(args.conversationId, { updatedAt: now });
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      status: "sent",
      createdAt: now,
    });

    await ctx.db.insert("agentQueue", {
      messageId,
      conversationId: args.conversationId,
      status: "pending",
      createdAt: now,
    });

    return messageId;
  },
});

export const list = authQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== ctx.auth.userId) {
      throw new ConvexError("Conversation not found");
    }

    const limit = args.limit ?? 200;
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .take(limit);
  },
});

// --- Internal mutations for agent streaming ---

export const createAssistantPlaceholder = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content: "",
      streaming: true,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const updateStreamingContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { content: args.content });
  },
});

export const finalizeMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    modelUsed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      streaming: false,
      status: "sent",
      modelUsed: args.modelUsed,
    });
  },
});

export const failMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      streaming: false,
      status: "failed",
      content: "Sorry, I encountered an error processing your message. Please try again.",
    });
  },
});
