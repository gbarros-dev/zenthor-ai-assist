import { homedir } from "node:os";
import { join } from "node:path";

import {
  AuthStorage,
  createAgentSession,
  InteractiveMode,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import type { Message } from "@mariozechner/pi-ai";

import { createConvexSync } from "./convex-sync.js";

const AGENT_DIR = join(homedir(), ".zenthor");

function resolveCredential(): string {
  const oauth =
    process.env.ANTHROPIC_OAUTH_TOKEN ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (oauth) return oauth;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) return apiKey;

  throw new Error(
    "Set ANTHROPIC_API_KEY, ANTHROPIC_OAUTH_TOKEN, or CLAUDE_CODE_OAUTH_TOKEN",
  );
}

function extractText(message: Message): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content;
    return message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  if (message.role === "assistant") {
    return message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  return "";
}

async function main(): Promise<void> {
  const credential = resolveCredential();

  const authStorage = AuthStorage.create(join(AGENT_DIR, "auth.json"));
  authStorage.setRuntimeApiKey("anthropic", credential);

  const modelRegistry = new ModelRegistry(authStorage);

  const { session, modelFallbackMessage } = await createAgentSession({
    agentDir: AGENT_DIR,
    authStorage,
    modelRegistry,
  });

  // ── Convex sync (optional) ───────────────────────────────────────────
  const sync = createConvexSync();
  if (sync) {
    try {
      await sync.init();
    } catch (error) {
      console.error(
        "[convex-sync] init failed, continuing without sync:",
        error instanceof Error ? error.message : error,
      );
    }

    let lastSyncedCount = 0;

    session.subscribe((event) => {
      if (event.type !== "agent_end") return;

      const messages = session.messages;
      const newMessages = messages.slice(lastSyncedCount);
      lastSyncedCount = messages.length;

      for (const msg of newMessages) {
        if (msg.role === "user" || msg.role === "assistant") {
          const text = extractText(msg as Message);
          if (!text) continue;

          const modelUsed =
            msg.role === "assistant"
              ? (msg as { model?: string }).model
              : undefined;

          sync.syncMessage(
            msg.role,
            text,
            modelUsed,
            msg.timestamp,
          );
        }
      }
    });
  }

  // ── TUI ──────────────────────────────────────────────────────────────
  const mode = new InteractiveMode(session, {
    modelFallbackMessage,
  });

  await mode.init();
  await mode.run();
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
