import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

/**
 * Internal mutations for TUI message sync.
 * Called via ConvexHttpClient with admin auth — no Clerk session required.
 */

export const getOrCreateConversation = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Find existing active TUI conversation
    const existing = await ctx.db
      .query("conversations")
      .filter((q) =>
        q.and(
          q.eq(q.field("channel"), "tui"),
          q.eq(q.field("status"), "active"),
        ),
      )
      .first();

    if (existing) return existing._id;

    // Find or create a local org for TUI usage
    let org = await ctx.db
      .query("organizations")
      .withIndex("by_external_id", (q) => q.eq("externalId", "tui-local-org"))
      .first();

    if (!org) {
      const now = Date.now();
      const orgId = await ctx.db.insert("organizations", {
        externalId: "tui-local-org",
        name: "TUI Local",
        slug: "tui-local",
        organizationType: "personal",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      org = (await ctx.db.get(orgId))!;
    }

    // Find or create a local user for TUI usage
    let user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", "tui-local"))
      .first();

    if (!user) {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        externalId: "tui-local",
        name: "TUI User",
        email: "tui@local",
        status: "active",
        role: "admin",
        activeOrganizationId: org._id,
        createdAt: now,
        updatedAt: now,
      });
      user = (await ctx.db.get(userId))!;
    }

    const now = Date.now();
    return await ctx.db.insert("conversations", {
      userId: user._id,
      organizationId: org._id,
      channel: "tui",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const syncMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    modelUsed: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Auto-title from first user message
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation && !conversation.title && args.role === "user") {
      await ctx.db.patch(args.conversationId, {
        title: args.content.slice(0, 80),
      });
    }

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      status: "sent",
      modelUsed: args.modelUsed,
      createdAt: args.createdAt,
    });

    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });
  },
});
