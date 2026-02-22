import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();
  },
});

export const getOrCreateUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", identity.subject))
      .first();

    if (existing) {
      // Update fields if changed
      const updates: Record<string, unknown> = {};
      if (existing.name !== args.name) updates.name = args.name;
      if (existing.email !== args.email) updates.email = args.email;
      if (args.image !== undefined && existing.image !== args.image) updates.image = args.image;

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = Date.now();
        await ctx.db.patch(existing._id, updates);
      }
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      externalId: identity.subject,
      name: args.name,
      email: args.email,
      image: args.image,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});
