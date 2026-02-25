# 2. Source Code

## File Map

| File                       | Lines | Purpose                                                               |
| -------------------------- | ----- | --------------------------------------------------------------------- |
| `src/index.ts`             | 488   | Main orchestrator: state, message loop, agent invocation              |
| `src/channels/whatsapp.ts` | ~400  | Baileys integration: auth, connect, send/receive, group sync          |
| `src/db.ts`                | ~500  | SQLite schema, all queries (messages, chats, tasks, sessions, groups) |
| `src/container-runner.ts`  | 646   | Spawn containers, build mounts, streaming output parser               |
| `src/group-queue.ts`       | 340   | Per-group FIFO queue, global concurrency (max 5)                      |
| `src/ipc.ts`               | ~250  | File-based IPC watcher (messages, tasks, groups)                      |
| `src/task-scheduler.ts`    | ~200  | Cron/interval/once task runner                                        |
| `src/mount-security.ts`    | 419   | Validate mounts against allowlist, block dangerous paths              |
| `src/router.ts`            | 45    | Message formatting (XML), output stripping                            |
| `src/config.ts`            | 69    | All constants: paths, timeouts, polling intervals                     |
| `src/types.ts`             | 104   | Channel interface, message types, group config                        |
| `src/container-runtime.ts` | -     | Docker/Apple Container detection and startup                          |
| `src/logger.ts`            | -     | Pino logger setup                                                     |
| `src/whatsapp-auth.ts`     | -     | Standalone WhatsApp authentication CLI                                |

## SQLite Schema

```sql
-- Chat metadata (discovery, no content)
chats (
  jid TEXT PRIMARY KEY,
  name TEXT,
  last_message_time TEXT,
  channel TEXT,           -- "whatsapp", "telegram", "discord"
  is_group INTEGER        -- 1=group, 0=1-on-1
)

-- Full message history (registered groups only)
messages (
  id TEXT PRIMARY KEY,
  chat_jid TEXT,
  sender TEXT,
  sender_name TEXT,
  content TEXT,
  timestamp TEXT,
  is_from_me INTEGER,
  is_bot_message INTEGER
)

-- Scheduled tasks
scheduled_tasks (
  id TEXT PRIMARY KEY,
  group_folder TEXT,
  chat_jid TEXT,
  prompt TEXT,
  schedule_type TEXT,     -- "cron" | "interval" | "once"
  schedule_value TEXT,    -- cron expr, ms, ISO timestamp
  context_mode TEXT,      -- "group" | "isolated"
  next_run TEXT,
  last_run TEXT,
  last_result TEXT,
  status TEXT,            -- "active" | "paused" | "completed"
  created_at TEXT
)

-- Task execution logs
task_run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  run_at TEXT,
  duration_ms INTEGER,
  status TEXT,            -- "success" | "error"
  result TEXT,
  error TEXT
)

-- Group registration config
registered_groups (
  jid TEXT PRIMARY KEY,
  name TEXT,
  folder TEXT UNIQUE,
  trigger_pattern TEXT,
  added_at TEXT,
  container_config TEXT,  -- JSON
  requires_trigger INTEGER
)

-- Claude session persistence
sessions (
  group_folder TEXT PRIMARY KEY,
  session_id TEXT
)

-- Polling state cursors
router_state (
  key TEXT PRIMARY KEY,   -- "last_timestamp", "last_agent_timestamp"
  value TEXT
)
```

## Key Types

```typescript
// Channel abstraction (src/types.ts)
interface Channel {
  name: string;
  connect(): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  sendMessage(jid: string, text: string): Promise<void>;
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
}

// Group configuration
interface RegisteredGroup {
  name: string; // "Family Chat"
  folder: string; // "family-chat"
  trigger: string; // "@Andy"
  added_at: string;
  containerConfig?: {
    additionalMounts?: [
      {
        hostPath: string;
        containerPath?: string;
        readonly?: boolean;
      },
    ];
    timeout?: number; // default: 300000ms
  };
  requiresTrigger?: boolean; // default: true
}

// Container input (JSON via stdin)
interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  secrets?: Record<string, string>;
}
```

## Configuration Constants (src/config.ts)

```typescript
ASSISTANT_NAME = process.env.ASSISTANT_NAME || "Andy";
POLL_INTERVAL = 2000; // Message loop: 2s
SCHEDULER_POLL_INTERVAL = 60000; // Task scheduler: 60s
MAX_CONCURRENT_CONTAINERS = 5; // Global concurrency
IDLE_TIMEOUT = 1800000; // 30min keep-alive
CONTAINER_TIMEOUT = 1800000; // 30min hard timeout
CONTAINER_MAX_OUTPUT_SIZE = 10485760; // 10MB max output
IPC_POLL_INTERVAL = 1000; // IPC file polling: 1s
```

## Directory Structure

```
nanoclaw/
├── src/                     # Host process code
│   ├── index.ts             # Orchestrator
│   ├── channels/whatsapp.ts # WhatsApp channel
│   ├── db.ts, config.ts, types.ts, router.ts
│   ├── container-runner.ts, container-runtime.ts
│   ├── group-queue.ts, ipc.ts, task-scheduler.ts
│   ├── mount-security.ts, logger.ts
│   └── whatsapp-auth.ts
├── container/
│   ├── Dockerfile           # node:22-slim + chromium
│   ├── build.sh
│   └── agent-runner/src/    # Code inside container
│       ├── index.ts         # Agent entry (Claude SDK)
│       └── ipc-mcp-stdio.ts # MCP server for tools
├── groups/
│   ├── CLAUDE.md            # Project-level memory
│   ├── global/CLAUDE.md     # All-groups memory
│   └── main/CLAUDE.md       # Admin memory
├── store/
│   ├── messages.db          # SQLite database
│   └── auth/                # WhatsApp session
├── data/
│   ├── sessions/{group}/.claude/  # Per-group sessions
│   ├── ipc/{group}/         # IPC directories
│   └── env/env              # Secrets for containers
├── setup/                   # Setup steps (8 modules)
├── skills-engine/           # Skill application engine
├── .claude/skills/          # 11 Claude Code skills
├── docs/                    # Architecture docs
└── logs/                    # Service logs
```

## Environment Variables

**Required:**

- `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`

**Optional:**

- `ASSISTANT_NAME` (default: "Andy")
- `CONTAINER_TIMEOUT`, `MAX_CONCURRENT_CONTAINERS`, `IDLE_TIMEOUT`
- `LOG_LEVEL` (default: "info")
- `TZ` (timezone for cron)

**Channel-specific (added by skills):**

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ONLY`, `TELEGRAM_BOT_POOL`
- `DISCORD_BOT_TOKEN`, `DISCORD_ONLY`
- `OPENAI_API_KEY` (Whisper voice transcription)
- `PARALLEL_API_KEY` (web research)
- `CHROME_PATH` (X/Twitter integration)
