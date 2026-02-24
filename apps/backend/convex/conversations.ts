import { v } from "convex/values";

import { authMutation, authQuery } from "./auth";

export const getOrCreate = authMutation({
  args: { channel: v.union(v.literal("web"), v.literal("whatsapp")) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_user_channel", (q) =>
        q.eq("userId", ctx.auth.userId).eq("channel", args.channel),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("conversations", {
      userId: ctx.auth.userId,
      organizationId: ctx.auth.organizationId,
      channel: args.channel,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = authQuery({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", ctx.auth.userId).eq("status", "active"),
      )
      .order("desc")
      .collect();

    return conversations;
  },
});

export const archive = authMutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.id);
    if (!conversation || conversation.userId !== ctx.auth.userId) {
      throw new Error("Conversation not found");
    }

    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: Date.now(),
    });
  },
});
