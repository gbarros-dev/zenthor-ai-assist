import { ConvexError, v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const DEFAULT_CONTEXT_LIMIT = 50;
const MAX_CONTEXT_LIMIT = 200;
const DEFAULT_FAILURE_MESSAGE =
  "Sorry, I encountered an error processing your message. Please try again.";

export const claimNextPendingJob = internalMutation({
  args: {
    workerId: v.string(),
    contextLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pendingJob = await ctx.db
      .query("agentQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .first();

    if (!pendingJob) {
      return null;
    }

    const now = Date.now();
    const contextLimit = Math.max(
      1,
      Math.min(MAX_CONTEXT_LIMIT, args.contextLimit ?? DEFAULT_CONTEXT_LIMIT),
    );

    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId: pendingJob.conversationId,
      role: "assistant",
      content: "",
      streaming: true,
      status: "pending",
      createdAt: now,
    });

    await ctx.db.patch(pendingJob._id, {
      status: "processing",
      startedAt: now,
      workerId: args.workerId,
      assistantMessageId,
      attempts: (pendingJob.attempts ?? 0) + 1,
    });

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", pendingJob.conversationId),
      )
      .filter((q) => q.eq(q.field("status"), "sent"))
      .order("asc")
      .take(contextLimit);

    return {
      jobId: pendingJob._id,
      conversationId: pendingJob.conversationId,
      assistantMessageId,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
    };
  },
});

export const updateStreamingContent = internalMutation({
  args: {
    jobId: v.id("agentQueue"),
    assistantMessageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "processing") {
      return false;
    }
    if (job.assistantMessageId !== args.assistantMessageId) {
      return false;
    }

    await ctx.db.patch(args.assistantMessageId, {
      content: args.content,
    });

    return true;
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.id("agentQueue"),
    assistantMessageId: v.id("messages"),
    content: v.string(),
    modelUsed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new ConvexError("Job not found");
    }
    if (job.assistantMessageId !== args.assistantMessageId) {
      throw new ConvexError("Assistant message mismatch");
    }

    const now = Date.now();
    await ctx.db.patch(args.assistantMessageId, {
      content: args.content,
      streaming: false,
      status: "sent",
      modelUsed: args.modelUsed,
    });

    await ctx.db.patch(args.jobId, {
      status: "completed",
      modelUsed: args.modelUsed,
      completedAt: now,
    });

    return null;
  },
});

export const failJob = internalMutation({
  args: {
    jobId: v.id("agentQueue"),
    assistantMessageId: v.optional(v.id("messages")),
    errorMessage: v.string(),
    messageForUser: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new ConvexError("Job not found");
    }

    const assistantMessageId = args.assistantMessageId ?? job.assistantMessageId;
    if (assistantMessageId) {
      await ctx.db.patch(assistantMessageId, {
        streaming: false,
        status: "failed",
        content: args.messageForUser ?? DEFAULT_FAILURE_MESSAGE,
      });
    }

    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });

    return null;
  },
});

export const getQueueHealth = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [pending, processing, failed] = await Promise.all([
      ctx.db
        .query("agentQueue")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect(),
      ctx.db
        .query("agentQueue")
        .withIndex("by_status", (q) => q.eq("status", "processing"))
        .collect(),
      ctx.db
        .query("agentQueue")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .collect(),
    ]);

    return {
      pending: pending.length,
      processing: processing.length,
      failed: failed.length,
    };
  },
});
