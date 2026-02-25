import { ConvexHttpClient } from "convex/browser";

type ConvexId = string;

/**
 * Optional Convex sync layer for TUI messages.
 * Writes user/assistant messages to Convex so they're visible in the web UI.
 * Uses admin auth (CONVEX_ADMIN_KEY) to call internal mutations directly.
 */
export class ConvexSync {
  private client: ConvexHttpClient;
  private conversationId: ConvexId | null = null;

  constructor(convexUrl: string, adminKey: string) {
    this.client = new ConvexHttpClient(convexUrl);
    (
      this.client as ConvexHttpClient & {
        setAdminAuth: (token: string) => void;
      }
    ).setAdminAuth(adminKey);
  }

  async init(): Promise<void> {
    this.conversationId = await this.mutation("tuiSync:getOrCreateConversation", {});
  }

  async syncMessage(
    role: "user" | "assistant",
    content: string,
    modelUsed?: string,
    createdAt?: number,
  ): Promise<void> {
    if (!this.conversationId || !content.trim()) return;

    try {
      await this.mutation("tuiSync:syncMessage", {
        conversationId: this.conversationId,
        role,
        content,
        modelUsed,
        createdAt: createdAt ?? Date.now(),
      });
    } catch (error) {
      // Don't crash the TUI if sync fails — just log it
      console.error(
        "[convex-sync] failed to sync message:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async mutation<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return (await (
      this.client as { mutation: (name: string, args: unknown) => Promise<unknown> }
    ).mutation(name, args)) as T;
  }
}

/**
 * Creates a ConvexSync instance if CONVEX_URL and CONVEX_ADMIN_KEY are set.
 * Returns null if either is missing — TUI works fine without Convex.
 */
export function createConvexSync(): ConvexSync | null {
  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  const adminKey = process.env.CONVEX_ADMIN_KEY;

  if (!convexUrl || !adminKey) {
    return null;
  }

  return new ConvexSync(convexUrl, adminKey);
}
