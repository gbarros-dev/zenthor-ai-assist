import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { authMutation, authQuery } from "./auth";

async function getNoteIfOwned(db: DatabaseReader, noteId: Id<"notes">, userId: Id<"users">) {
  const note = await db.get(noteId);
  if (!note || note.userId !== userId) {
    throw new ConvexError("Note not found");
  }
  return note;
}

export const get = authQuery({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    const note = await getNoteIfOwned(ctx.db, args.id, ctx.auth.userId);
    if (note.deletedAt) {
      throw new ConvexError("Note not found");
    }
    return note;
  },
});

export const list = authQuery({
  args: {
    isArchived: v.boolean(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", ctx.auth.userId).eq("isArchived", args.isArchived),
      )
      .order("desc")
      .collect();

    // Filter out trashed notes and apply limit
    return notes.filter((n) => !n.deletedAt).slice(0, args.limit);
  },
});

export const listTrashed = authQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", ctx.auth.userId).eq("organizationId", ctx.auth.organizationId),
      )
      .order("desc")
      .collect();

    return notes.filter((n) => n.deletedAt !== undefined).slice(0, args.limit);
  },
});

export const create = authMutation({
  args: {
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    folderId: v.optional(v.id("noteFolders")),
    source: v.optional(
      v.union(v.literal("manual"), v.literal("chat-generated"), v.literal("imported")),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId: ctx.auth.userId,
      organizationId: ctx.auth.organizationId,
      title: args.title,
      content: args.content,
      folderId: args.folderId,
      isPinned: false,
      isArchived: false,
      source: args.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authMutation({
  args: {
    id: v.id("notes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    isPinned: v.optional(v.boolean()),
    folderId: v.optional(v.id("noteFolders")),
  },
  handler: async (ctx, args) => {
    await getNoteIfOwned(ctx.db, args.id, ctx.auth.userId);

    const { id, ...fields } = args;
    // Only patch provided fields
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.content !== undefined) patch.content = fields.content;
    if (fields.isPinned !== undefined) patch.isPinned = fields.isPinned;
    if (fields.folderId !== undefined) patch.folderId = fields.folderId;

    await ctx.db.patch(id, patch);
  },
});

export const archive = authMutation({
  args: {
    id: v.id("notes"),
    isArchived: v.boolean(),
  },
  handler: async (ctx, args) => {
    await getNoteIfOwned(ctx.db, args.id, ctx.auth.userId);
    await ctx.db.patch(args.id, {
      isArchived: args.isArchived,
      updatedAt: Date.now(),
    });
  },
});

export const moveToFolder = authMutation({
  args: {
    id: v.id("notes"),
    folderId: v.optional(v.id("noteFolders")),
  },
  handler: async (ctx, args) => {
    await getNoteIfOwned(ctx.db, args.id, ctx.auth.userId);
    await ctx.db.patch(args.id, {
      folderId: args.folderId,
      updatedAt: Date.now(),
    });
  },
});

export const deleteNote = authMutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    await getNoteIfOwned(ctx.db, args.id, ctx.auth.userId);
    await ctx.db.patch(args.id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const restoreNote = authMutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    await getNoteIfOwned(ctx.db, args.id, ctx.auth.userId);
    await ctx.db.patch(args.id, {
      deletedAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const permanentlyDelete = authMutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    await getNoteIfOwned(ctx.db, args.id, ctx.auth.userId);
    await ctx.db.delete(args.id);
  },
});

export const emptyTrash = authMutation({
  args: {},
  handler: async (ctx) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", ctx.auth.userId).eq("organizationId", ctx.auth.organizationId),
      )
      .collect();

    const trashed = notes.filter((n) => n.deletedAt !== undefined);
    for (const note of trashed) {
      await ctx.db.delete(note._id);
    }
  },
});
