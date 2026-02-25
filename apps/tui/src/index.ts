import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Message } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  InteractiveMode,
  ModelRegistry,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";

import { createConvexSync } from "./convex-sync.js";

const AGENT_DIR = join(homedir(), ".zenthor");

type AiProvider = "anthropic" | "openai" | "openai-codex";
type ParsedModelRef = { provider: string; modelId: string };
type ProviderSelection = {
  provider: AiProvider;
  source: "explicit" | "anthropic" | "openai" | "openai-codex";
};
type StartupInfoMode = "compact" | "verbose";
type ModelSelectionAttempt = {
  model?: string;
  source: "general-env" | "provider-env" | "fallback";
};
type ResolvedModelSelection = {
  model: AvailableModel;
  source: "requested" | "fallback";
  requestedModel?: string;
  requestedModelSource?: ModelSelectionAttempt["source"];
};

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseStartupInfoMode(value: string | undefined): StartupInfoMode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "compact" || normalized === "verbose") {
    return normalized;
  }
  return undefined;
}

const ALLOWED_AI_PROVIDERS: ReadonlyArray<AiProvider> = [
  "anthropic",
  "openai",
  "openai-codex",
] as const;

function resolveAnthropicCredential(): string | undefined {
  const oauth = process.env.ANTHROPIC_OAUTH_TOKEN ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (oauth) return oauth;

  return process.env.ANTHROPIC_API_KEY?.trim();
}

function resolveOpenAiCredential(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim();
}

function resolveStartupInfoMode(settingsManager: SettingsManager): StartupInfoMode {
  const globalSettings = settingsManager.getGlobalSettings() as {
    startupInfo?: string;
    startupInfoMode?: string;
  };

  return (
    parseStartupInfoMode(process.env.ZENTHOR_TUI_STARTUP_INFO) ??
    parseStartupInfoMode(process.env.ZENTHOR_AI_STARTUP_INFO) ??
    parseStartupInfoMode(globalSettings.startupInfo) ??
    parseStartupInfoMode(globalSettings.startupInfoMode) ??
    "compact"
  );
}

function resolveOpenAiCodexCredential(): string | undefined {
  const codexHome = process.env.CODEX_HOME?.trim() ?? join(homedir(), ".codex");
  const normalizedCodexHome =
    codexHome === "~" || codexHome.startsWith("~/")
      ? join(homedir(), codexHome.replace(/^~\//, ""))
      : codexHome;
  const candidateAuthFiles = [join(normalizedCodexHome, "auth.json")];

  for (const filePath of candidateAuthFiles) {
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      if (!raw || typeof raw !== "object") continue;
      const tokens = (raw as Record<string, unknown>).tokens;
      if (!tokens || typeof tokens !== "object") continue;
      const accessToken = (tokens as Record<string, unknown>).access_token;
      if (typeof accessToken !== "string") continue;
      const trimmed = accessToken.trim();
      if (!trimmed) continue;
      return trimmed;
    } catch {
      // Intentionally ignore malformed or missing Codex auth files.
      continue;
    }
  }

  return undefined;
}

function normalizeProvider(raw: string | undefined): AiProvider | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();

  if (normalized === "anthropic" || normalized === "claude") {
    return "anthropic";
  }

  if (normalized === "openai" || normalized === "gpt") {
    return "openai";
  }
  if (normalized === "openai-codex" || normalized === "codex") {
    return "openai-codex";
  }

  return ALLOWED_AI_PROVIDERS.includes(normalized as AiProvider)
    ? (normalized as AiProvider)
    : undefined;
}

function resolveProviderSelectionWithSource(): ProviderSelection {
  const rawProvider =
    process.env.ZENTHOR_AI_PROVIDER ?? process.env.TUI_PROVIDER ?? process.env.AI_PROVIDER;
  const configuredProvider = normalizeProvider(rawProvider);
  if (configuredProvider) {
    return { provider: configuredProvider, source: "explicit" };
  }
  if (rawProvider) {
    throw new Error(
      `Unsupported provider '${rawProvider}'. Supported providers: anthropic, openai, openai-codex.`,
    );
  }

  const anthropicCredential = resolveAnthropicCredential();
  const openaiCredential = resolveOpenAiCredential();
  const openaiCodexCredential = resolveOpenAiCodexCredential();

  if (anthropicCredential && !openaiCredential) {
    return { provider: "anthropic", source: "anthropic" };
  }
  if (openaiCredential && !anthropicCredential && !openaiCodexCredential) {
    return { provider: "openai", source: "openai" };
  }
  if (openaiCodexCredential && !anthropicCredential && !openaiCredential) {
    return { provider: "openai-codex", source: "openai-codex" };
  }

  if (anthropicCredential) {
    return { provider: "anthropic", source: "anthropic" };
  }
  if (openaiCredential) {
    return { provider: "openai", source: "openai" };
  }
  if (openaiCodexCredential) {
    return { provider: "openai-codex", source: "openai-codex" };
  }

  throw new Error(
    "Set OPENAI_API_KEY, a valid OpenAI subscription token in ~/.codex/auth.json (or CODEX_HOME/auth.json), or ANTHROPIC_API_KEY/CLAUDE_CODE_OAUTH_TOKEN/ANTHROPIC_OAUTH_TOKEN",
  );
}

function resolveProviderCredential(provider: AiProvider): string {
  if (provider === "anthropic") {
    const credential = resolveAnthropicCredential();
    if (credential) return credential;
    throw new Error("Set ANTHROPIC_API_KEY, ANTHROPIC_OAUTH_TOKEN, or CLAUDE_CODE_OAUTH_TOKEN");
  }

  if (provider === "openai-codex") {
    const credential = resolveOpenAiCodexCredential();
    if (credential) return credential;
    throw new Error(
      "Sign in to ChatGPT/Codex and keep a valid auth file at ~/.codex/auth.json (or CODEX_HOME/auth.json)",
    );
  }

  const credential = resolveOpenAiCredential();
  if (credential) return credential;
  throw new Error("Set OPENAI_API_KEY");
}

function parseModelRef(raw: string): ParsedModelRef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const separator = trimmed.indexOf("/");
  if (separator === -1) {
    return null;
  }

  const provider = trimmed.slice(0, separator).trim().toLowerCase();
  const modelId = trimmed.slice(separator + 1).trim();
  if (!provider || !modelId) {
    return null;
  }

  return { provider, modelId };
}

function resolveRequestedModelWithSource(provider: AiProvider): ModelSelectionAttempt {
  const rawGeneral = process.env.ZENTHOR_MODEL?.trim() ?? process.env.TUI_MODEL?.trim();
  if (rawGeneral) {
    return { model: rawGeneral, source: "general-env" };
  }

  const providerSpecific =
    provider === "anthropic"
      ? process.env.ANTHROPIC_MODEL?.trim()
      : process.env.OPENAI_MODEL?.trim();
  if (providerSpecific) {
    return { model: providerSpecific, source: "provider-env" };
  }

  return { source: "fallback" };
}

async function resolveModel({
  modelRegistry,
  provider,
  requestedModelAttempt,
}: {
  modelRegistry: ModelRegistry;
  provider: AiProvider;
  requestedModelAttempt: ModelSelectionAttempt;
}): Promise<ResolvedModelSelection | undefined> {
  const requestedModel = requestedModelAttempt.model?.trim();
  if (requestedModel) {
    const parsedRequested = parseModelRef(requestedModel);
    if (parsedRequested) {
      const requested = modelRegistry.find(parsedRequested.provider, parsedRequested.modelId);
      if (requested && (await modelRegistry.getApiKey(requested))) {
        return {
          model: requested,
          source: "requested",
          requestedModel,
          requestedModelSource: requestedModelAttempt.source,
        };
      }
    } else {
      const byProvider = modelRegistry.find(provider, requestedModel);
      if (byProvider && (await modelRegistry.getApiKey(byProvider))) {
        return {
          model: byProvider,
          source: "requested",
          requestedModel,
          requestedModelSource: requestedModelAttempt.source,
        };
      }
    }
  }

  const available = await modelRegistry.getAvailable();
  const providerModels = available.filter((model) => model.provider === provider);
  if (providerModels.length > 0) {
    const firstProviderModel = providerModels[0];
    if (!firstProviderModel) {
      return undefined;
    }
    return { model: firstProviderModel, source: "fallback" };
  }

  return undefined;
}

type AvailableModel = Awaited<ReturnType<ModelRegistry["getAvailable"]>>[number];
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
  const resolvedProvider = resolveProviderSelectionWithSource();
  const providerSelectionSource = resolvedProvider.source;
  const provider = resolvedProvider.provider;
  const credential = resolveProviderCredential(provider);

  const authStorage = AuthStorage.create(join(AGENT_DIR, "auth.json"));
  authStorage.setRuntimeApiKey(provider, credential);
  const settingsManager = SettingsManager.create(process.cwd(), AGENT_DIR);
  const requestedQuietStartup =
    parseBooleanEnv(process.env.ZENTHOR_AI_QUIET_STARTUP) ??
    parseBooleanEnv(process.env.ZENTHOR_AI_COMPACT_STARTUP);
  if (requestedQuietStartup !== undefined) {
    settingsManager.setQuietStartup(requestedQuietStartup);
  }
  const startupInfoMode = resolveStartupInfoMode(settingsManager);

  const modelRegistry = new ModelRegistry(authStorage);
  const requestedModelAttempt = resolveRequestedModelWithSource(provider);
  const selectedModel = await resolveModel({
    modelRegistry,
    provider,
    requestedModelAttempt,
  });
  const resolvedModel = selectedModel;
  const initialModel = resolvedModel?.model as AvailableModel | undefined;
  if (!initialModel || !resolvedModel) {
    throw new Error(
      `No runnable model found for provider '${provider}'. Configure model credentials and a supported model.`,
    );
  }
  const modelSelectionSourceLabel = resolvedModel.requestedModel
    ? `requested=${resolvedModel.requestedModel} (${resolvedModel.requestedModelSource})`
    : "fallback";
  const modelRef = `${initialModel.provider}/${initialModel.id}`;
  const startupInfo = `provider=${provider} model=${modelRef}`;
  if (startupInfoMode === "verbose") {
    console.info(
      `[zenthor:tui] startup provider=${provider} (source=${providerSelectionSource}) model=${modelRef} (source=${resolvedModel.source}, ${modelSelectionSourceLabel})`,
    );
  } else {
    console.info(`[zenthor:tui] startup ${startupInfo}`);
  }

  const { session, modelFallbackMessage } = await createAgentSession({
    agentDir: AGENT_DIR,
    authStorage,
    modelRegistry,
    model: initialModel,
    settingsManager,
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
            msg.role === "assistant" ? (msg as { model?: string }).model : undefined;

          sync.syncMessage(msg.role, text, modelUsed, msg.timestamp);
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
