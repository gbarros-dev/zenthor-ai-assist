import { readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import { getModels, type AssistantMessage, type Message, type Usage } from "@mariozechner/pi-ai";
import { memoryTool, todoistTool, webFetchTool, webSearchTool } from "@zenthor-ai-assist/tools";
import { ConvexHttpClient } from "convex/browser";

const BASE_SYSTEM_PROMPT = `You are Zenthor, a helpful personal AI assistant. You help with organizing thoughts, managing notes, answering questions, and having productive conversations.

Guidelines:
- Be concise and helpful
- Use markdown formatting when it improves readability
- If you don't know something, say so honestly
- Be friendly but professional`;

function buildSystemPrompt(): string {
  // Load ~/.zenthor/CLAUDE.md if it exists — same persona/tool docs as the TUI
  try {
    const claudeMdPath = join(homedir(), ".zenthor", "CLAUDE.md");
    const claudeMd = readFileSync(claudeMdPath, "utf-8");
    return `${BASE_SYSTEM_PROMPT}\n\n${claudeMd}`;
  } catch {
    return BASE_SYSTEM_PROMPT;
  }
}

const SYSTEM_PROMPT = buildSystemPrompt();
const customTools = [
  webFetchTool,
  webSearchTool,
  todoistTool,
  memoryTool,
] as unknown as AgentTool[];

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_CONTEXT_LIMIT = 50;
const DEFAULT_MAX_ATTEMPTS = 3;
const STREAM_UPDATE_INTERVAL_MS = 500;
const STREAM_UPDATE_CHARS = 200;

interface WorkerConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

interface ClaimedJob {
  jobId: string;
  conversationId: string;
  assistantMessageId: string;
  messages: WorkerConversationMessage[];
}

interface WorkerConfig {
  convexUrl: string;
  convexAdminKey: string;
  anthropicCredential: string;
  anthropicModel?: string;
  pollIntervalMs: number;
  contextLimit: number;
  workerId: string;
  maxAttempts: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function resolveConvexAdminKey(): string {
  const canonical = process.env.CONVEX_ADMIN_KEY?.trim();
  if (canonical) {
    return canonical;
  }

  const legacy = process.env.CONVEX_DEPLOY_KEY?.trim();
  if (legacy) {
    console.warn(
      "[worker] CONVEX_DEPLOY_KEY is deprecated. Use CONVEX_ADMIN_KEY instead.",
    );
    return legacy;
  }

  throw new Error("CONVEX_ADMIN_KEY must be set (or legacy CONVEX_DEPLOY_KEY).");
}

function optionalIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveAnthropicCredential(): string {
  const oauthToken = process.env.ANTHROPIC_OAUTH_TOKEN ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (oauthToken) {
    return oauthToken;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    return apiKey;
  }

  throw new Error(
    "Missing Anthropic credential. Set one of ANTHROPIC_OAUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, or ANTHROPIC_API_KEY.",
  );
}

function readConfig(): WorkerConfig {
  const convexUrl =
    process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? requiredEnv("CONVEX_URL");
  const convexAdminKey = resolveConvexAdminKey();
  const anthropicCredential = resolveAnthropicCredential();
  const anthropicModel = process.env.ANTHROPIC_MODEL;
  const pollIntervalMs = optionalIntEnv("AGENT_WORKER_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS);
  const contextLimit = optionalIntEnv("AGENT_WORKER_CONTEXT_LIMIT", DEFAULT_CONTEXT_LIMIT);
  const maxAttempts = optionalIntEnv("AGENT_WORKER_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);
  const workerId = process.env.AGENT_WORKER_ID ?? `${hostname()}-${process.pid}`;

  return {
    convexUrl,
    convexAdminKey,
    anthropicCredential,
    anthropicModel,
    pollIntervalMs,
    contextLimit,
    workerId,
    maxAttempts,
  };
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

function toPiMessage(message: WorkerConversationMessage, fallbackModelId: string): Message {
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
    if (!message) {
      continue;
    }
    if (message.role === "assistant") {
      return extractAssistantText(message);
    }
  }
  return "";
}

function resolveAnthropicModel(configuredModelId?: string) {
  const models = getModels("anthropic");
  if (models.length === 0) {
    throw new Error("No Anthropic models found in pi-ai registry");
  }

  if (configuredModelId) {
    const configured = models.find((model) => model.id === configuredModelId);
    if (configured) {
      return configured;
    }
    console.warn(
      `[worker] ANTHROPIC_MODEL '${configuredModelId}' not found, falling back to '${DEFAULT_MODEL}'`,
    );
  }

  const fallback = models.find((model) => model.id === DEFAULT_MODEL) ?? models[0];
  if (!fallback) {
    throw new Error("No Anthropic fallback model available");
  }
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMutation<T>(
  client: ConvexHttpClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  return (await (
    client as { mutation: (name: string, params: unknown) => Promise<unknown> }
  ).mutation(functionName, args)) as T;
}

async function processClaimedJob(
  client: ConvexHttpClient,
  config: WorkerConfig,
  job: ClaimedJob,
): Promise<void> {
  const model = resolveAnthropicModel(config.anthropicModel);
  const modelId = model.id;
  const piMessages = job.messages.map((message) => toPiMessage(message, modelId));
  const lastMessage = piMessages[piMessages.length - 1];
  if (!lastMessage || lastMessage.role === "assistant") {
    throw new Error("Invalid context: last message must be user or toolResult");
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      messages: piMessages,
    },
    getApiKey: (provider) => (provider === "anthropic" ? config.anthropicCredential : undefined),
  });

  agent.setTools(customTools);

  let streamedText = "";
  let lastPersistedText = "";
  let lastUpdateTime = Date.now();
  let streamUpdateError: Error | null = null;
  let updateQueue: Promise<void> = Promise.resolve();

  const queueStreamingUpdate = (content: string) => {
    if (streamUpdateError) return;

    updateQueue = updateQueue
      .then(async () => {
        const updated = await runMutation<boolean>(client, "agentWorker:updateStreamingContent", {
          jobId: job.jobId,
          assistantMessageId: job.assistantMessageId,
          content,
        });
        if (!updated) {
          throw new Error("Streaming update rejected by Convex");
        }
      })
      .catch((error: unknown) => {
        streamUpdateError =
          error instanceof Error ? error : new Error(`Streaming update failed: ${String(error)}`);
      });
  };

  const unsubscribe = agent.subscribe((event) => {
    if (event.type !== "message_update") return;
    if (event.assistantMessageEvent.type !== "text_delta") return;

    streamedText += event.assistantMessageEvent.delta;
    const now = Date.now();
    const charsSinceUpdate = streamedText.length - lastPersistedText.length;
    const timeSinceUpdate = now - lastUpdateTime;

    if (charsSinceUpdate >= STREAM_UPDATE_CHARS || timeSinceUpdate >= STREAM_UPDATE_INTERVAL_MS) {
      queueStreamingUpdate(streamedText);
      lastPersistedText = streamedText;
      lastUpdateTime = now;
    }
  });

  try {
    await agent.continue();
  } finally {
    unsubscribe();
  }

  await updateQueue;
  if (streamUpdateError) {
    throw streamUpdateError;
  }

  const finalText = findFinalAssistantText(agent.state.messages as Message[]);
  const content = finalText || streamedText;
  if (!content.trim()) {
    throw new Error("Model returned empty response");
  }

  await runMutation(client, "agentWorker:completeJob", {
    jobId: job.jobId,
    assistantMessageId: job.assistantMessageId,
    content,
    modelUsed: modelId,
  });
}

async function runWorker(config: WorkerConfig): Promise<void> {
  const client = new ConvexHttpClient(config.convexUrl);
  (
    client as ConvexHttpClient & {
      setAdminAuth: (token: string) => void;
    }
  ).setAdminAuth(config.convexAdminKey);

  let stopRequested = false;
  process.on("SIGINT", () => {
    stopRequested = true;
  });
  process.on("SIGTERM", () => {
    stopRequested = true;
  });

  console.log(`[worker] started id=${config.workerId} poll=${config.pollIntervalMs}ms`);

  while (!stopRequested) {
    let claimedJob: ClaimedJob | null = null;
    try {
      claimedJob = await runMutation<ClaimedJob | null>(client, "agentWorker:claimNextPendingJob", {
        workerId: config.workerId,
        contextLimit: config.contextLimit,
      });
    } catch (error) {
      console.error("[worker] failed to claim job:", error);
      await sleep(config.pollIntervalMs);
      continue;
    }

    if (!claimedJob) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    try {
      await processClaimedJob(client, config, claimedJob);
      console.log(`[worker] completed job ${claimedJob.jobId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[worker] failed job ${claimedJob.jobId}:`, error);

      try {
        await runMutation(client, "agentWorker:failJob", {
          jobId: claimedJob.jobId,
          assistantMessageId: claimedJob.assistantMessageId,
          errorMessage,
          maxAttempts: config.maxAttempts,
        });
      } catch (failPersistError) {
        console.error(
          `[worker] failed to persist job failure ${claimedJob.jobId}:`,
          failPersistError,
        );
      }
    }
  }

  console.log("[worker] stopped");
}

async function main(): Promise<void> {
  const config = readConfig();
  await runWorker(config);
}

main().catch((error) => {
  console.error("[worker] fatal error:", error);
  process.exit(1);
});
