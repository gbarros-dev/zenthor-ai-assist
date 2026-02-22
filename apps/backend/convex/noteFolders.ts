import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { authMutation, authQuery } from "./auth";

async function getFolderIfOwned(
  db: DatabaseReader,
  folderId: Id<"noteFolders">,
  userId: Id<"users">,
) {
  const folder = await db.get(folderId);
  if (!folder || folder.userId !== userId) {
    throw new ConvexError("Folder not found");
  }
  return folder;
}

export const list = authQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("noteFolders")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", ctx.auth.userId).eq("organizationId", ctx.auth.organizationId),
      )
      .collect();
  },
});

export const create = authMutation({
  args: {
    name: v.string(),
    color: v.string(),
    parentId: v.optional(v.id("noteFolders")),
  },
  handler: async (ctx, args) => {
    // Auto-increment position: count existing siblings
    const siblings = await ctx.db
      .query("noteFolders")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();

    const userSiblings = siblings.filter((f) => f.userId === ctx.auth.userId);
    const position = userSiblings.length;

    const now = Date.now();
    return await ctx.db.insert("noteFolders", {
      userId: ctx.auth.userId,
      organizationId: ctx.auth.organizationId,
      name: args.name,
      color: args.color,
      position,
      parentId: args.parentId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authMutation({
  args: {
    id: v.id("noteFolders"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    position: v.optional(v.number()),
    parentId: v.optional(v.id("noteFolders")),
  },
  handler: async (ctx, args) => {
    await getFolderIfOwned(ctx.db, args.id, ctx.auth.userId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.color !== undefined) patch.color = args.color;
    if (args.position !== undefined) patch.position = args.position;
    if (args.parentId !== undefined) patch.parentId = args.parentId;

    await ctx.db.patch(args.id, patch);
  },
});

export const remove = authMutation({
  args: { id: v.id("noteFolders") },
  handler: async (ctx, args) => {
    const folder = await getFolderIfOwned(ctx.db, args.id, ctx.auth.userId);

    // Reparent children to the deleted folder's parent
    const children = await ctx.db
      .query("noteFolders")
      .withIndex("by_parent", (q) => q.eq("parentId", args.id))
      .collect();

    for (const child of children) {
      await ctx.db.patch(child._id, {
        parentId: folder.parentId,
        updatedAt: Date.now(),
      });
    }

    // Unfile notes that were in this folder
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_folder", (q) => q.eq("folderId", args.id))
      .collect();

    for (const note of notes) {
      await ctx.db.patch(note._id, {
        folderId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(args.id);
  },
});

export const moveFolder = authMutation({
  args: {
    id: v.id("noteFolders"),
    parentId: v.optional(v.id("noteFolders")),
  },
  handler: async (ctx, args) => {
    await getFolderIfOwned(ctx.db, args.id, ctx.auth.userId);

    // Cycle detection: walk up from target parent, ensure we don't hit args.id
    if (args.parentId) {
      await getFolderIfOwned(ctx.db, args.parentId, ctx.auth.userId);

      let current: Id<"noteFolders"> | undefined = args.parentId;
      while (current) {
        if (current === args.id) {
          throw new ConvexError("Cannot move folder into its own descendant");
        }
        const parent: Doc<"noteFolders"> | null = await ctx.db.get(current);
        current = parent?.parentId;
      }
    }

    await ctx.db.patch(args.id, {
      parentId: args.parentId,
      updatedAt: Date.now(),
    });
  },
});
