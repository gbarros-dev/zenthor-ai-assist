import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const getJob = internalQuery({
  args: { jobId: v.id("agentQueue") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const getConversationMessages = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.eq(q.field("status"), "sent"))
      .order("asc")
      .take(args.limit);

    return messages;
  },
});

export const claimJobIfPending = internalMutation({
  args: { jobId: v.id("agentQueue") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "pending") {
      return false;
    }

    await ctx.db.patch(args.jobId, {
      status: "processing",
      startedAt: Date.now(),
    });

    return true;
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.id("agentQueue"),
    modelUsed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "completed",
      modelUsed: args.modelUsed,
      completedAt: Date.now(),
    });
  },
});

export const failJob = internalMutation({
  args: {
    jobId: v.id("agentQueue"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });
  },
});
