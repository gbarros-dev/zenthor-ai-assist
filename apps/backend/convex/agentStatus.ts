import { v } from "convex/values";

import { authQuery } from "./auth";

export const isProcessing = authQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== ctx.auth.userId) {
      return false;
    }

    const activeJob = await ctx.db
      .query("agentQueue")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("status"), "processing"),
        ),
      )
      .first();

    return activeJob !== null;
  },
});
