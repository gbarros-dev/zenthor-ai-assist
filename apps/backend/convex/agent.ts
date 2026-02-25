"use node";

import { Agent } from "@mariozechner/pi-agent-core";
import { getModels, type AssistantMessage, type Message, type Usage } from "@mariozechner/pi-ai";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

const SYSTEM_PROMPT = `You are Zenthor, a helpful personal AI assistant. You help with organizing thoughts, managing notes, answering questions, and having productive conversations.

Guidelines:
- Be concise and helpful
- Use markdown formatting when it improves readability
- If you don't know something, say so honestly
- Be friendly but professional`;

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_CONTEXT_MESSAGES = 50;
const STREAM_UPDATE_INTERVAL_MS = 500;
const STREAM_UPDATE_CHARS = 200;

interface PersistedConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

function createEmptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function toPiMessage(message: PersistedConversationMessage, fallbackModelId: string): Message {
  if (message.role === "user") {
    return {
      role: "user",
      content: message.content,
      timestamp: message.createdAt,
    };
  }

  return {
    role: "assistant",
    content: [{ type: "text", text: message.content }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: fallbackModelId,
    usage: createEmptyUsage(),
    stopReason: "stop",
    timestamp: message.createdAt,
  };
}

function extractAssistantText(message: AssistantMessage): string {
  let text = "";
  for (const block of message.content) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text;
}

function findFinalAssistantText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "assistant") {
      return extractAssistantText(message);
    }
  }
  return "";
}

function resolveAnthropicModel(configuredModelId?: string) {
  const availableModels = getModels("anthropic");
  if (availableModels.length === 0) {
    throw new Error("No Anthropic models available in pi-ai model registry");
  }

  if (configuredModelId) {
    const configured = availableModels.find((m) => m.id === configuredModelId);
    if (configured) {
      return configured;
    }
    console.warn(
      `[agent] ANTHROPIC_MODEL '${configuredModelId}' not found, falling back to '${DEFAULT_MODEL}'`,
    );
  }

  return availableModels.find((m) => m.id === DEFAULT_MODEL) ?? availableModels[0];
}

export const processJob = internalAction({
  args: { jobId: v.id("agentQueue") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.agentInternal.getJob, {
      jobId: args.jobId,
    });
    if (!job) {
      return;
    }

    const claimed = await ctx.runMutation(internal.agentInternal.claimJobIfPending, {
      jobId: args.jobId,
    });
    if (!claimed) {
      // Already claimed or completed by another worker invocation.
      return;
    }

    let assistantMessageId: Id<"messages"> | undefined;
    try {
      const messages = (await ctx.runQuery(internal.agentInternal.getConversationMessages, {
        conversationId: job.conversationId,
        limit: MAX_CONTEXT_MESSAGES,
      })) as PersistedConversationMessage[];

      assistantMessageId = await ctx.runMutation(internal.messages.createAssistantPlaceholder, {
        conversationId: job.conversationId,
      });
      const currentAssistantMessageId = assistantMessageId;

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY not configured");
      }

      const configuredModelId = process.env.ANTHROPIC_MODEL;
      const model = resolveAnthropicModel(configuredModelId);
      const modelId = model.id;

      const piMessages = messages.map((message) => toPiMessage(message, modelId));
      const lastMessage = piMessages[piMessages.length - 1];
      if (!lastMessage || lastMessage.role === "assistant") {
        throw new Error("Conversation context is invalid for continue()");
      }

      const agent = new Agent({
        initialState: {
          systemPrompt: SYSTEM_PROMPT,
          model,
          messages: piMessages,
        },
        getApiKey: (provider) => (provider === "anthropic" ? apiKey : undefined),
      });

      let streamedText = "";
      let lastPersistedText = "";
      let lastUpdateTime = Date.now();
      let pendingStreamUpdates: Promise<unknown> = Promise.resolve();
      let streamUpdateError: Error | null = null;

      const queueStreamUpdate = (content: string) => {
        if (streamUpdateError) return;
        pendingStreamUpdates = pendingStreamUpdates
          .then(() =>
            ctx.runMutation(internal.messages.updateStreamingContent, {
              messageId: currentAssistantMessageId,
              content,
            }),
          )
          .catch((error) => {
            streamUpdateError =
              error instanceof Error
                ? error
                : new Error(`Streaming update failed: ${String(error)}`);
          });
      };

      const unsubscribe = agent.subscribe((event) => {
        if (event.type !== "message_update") return;
        if (event.assistantMessageEvent.type !== "text_delta") return;

        streamedText += event.assistantMessageEvent.delta;

        const now = Date.now();
        const charsSinceUpdate = streamedText.length - lastPersistedText.length;
        const timeSinceUpdate = now - lastUpdateTime;

        if (
          charsSinceUpdate >= STREAM_UPDATE_CHARS ||
          timeSinceUpdate >= STREAM_UPDATE_INTERVAL_MS
        ) {
          queueStreamUpdate(streamedText);
          lastPersistedText = streamedText;
          lastUpdateTime = now;
        }
      });

      try {
        await agent.continue();
      } finally {
        unsubscribe();
      }

      await pendingStreamUpdates;
      if (streamUpdateError) {
        throw streamUpdateError;
      }

      const finalText = findFinalAssistantText(agent.state.messages as Message[]);
      const content = finalText || streamedText;

      if (content !== lastPersistedText) {
        await ctx.runMutation(internal.messages.updateStreamingContent, {
          messageId: assistantMessageId,
          content,
        });
      }

      await ctx.runMutation(internal.messages.finalizeMessage, {
        messageId: assistantMessageId,
        content,
        modelUsed: modelId,
      });

      await ctx.runMutation(internal.agentInternal.completeJob, {
        jobId: args.jobId,
        modelUsed: modelId,
      });
    } catch (error) {
      console.error("Agent processing error:", error);

      if (assistantMessageId) {
        await ctx.runMutation(internal.messages.failMessage, {
          messageId: assistantMessageId,
        });
      }

      await ctx.runMutation(internal.agentInternal.failJob, {
        jobId: args.jobId,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});
