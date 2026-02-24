import { homedir } from "node:os";
import { join } from "node:path";

import {
  AuthStorage,
  createAgentSession,
  InteractiveMode,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";

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
