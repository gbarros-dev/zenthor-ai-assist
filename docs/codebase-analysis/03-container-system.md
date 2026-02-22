# 3. Container System

## Overview

NanoClaw runs Claude agents inside isolated Linux containers (Docker or Apple Container on macOS). The host process spawns containers on demand, communicates via stdin/stdout + file-based IPC, and enforces security through mount restrictions.

## Container Image

**Dockerfile:** `container/Dockerfile`

```dockerfile
FROM node:22-slim
# Chromium + fonts for agent-browser
# npm install -g agent-browser @anthropic-ai/claude-code
# Copy and build agent-runner
ENTRYPOINT ["/app/entrypoint.sh"]
```

**Runtime:** node user (uid 1000), working dir `/workspace/group`

## Agent Runner (Inside Container)

### Files

| File | Purpose |
|------|---------|
| `container/agent-runner/src/index.ts` | Main entry: stdin parsing, Claude SDK query loop, IPC polling |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | MCP stdio server providing tools to the agent |

### Dependencies

- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK
- `@modelcontextprotocol/sdk` - MCP protocol

### Input Protocol (stdin JSON)

```typescript
{
  prompt: string,          // XML-formatted messages
  sessionId?: string,      // Resume previous session
  groupFolder: string,
  chatJid: string,
  isMain: boolean,
  isScheduledTask?: boolean,
  secrets?: { CLAUDE_CODE_OAUTH_TOKEN?, ANTHROPIC_API_KEY? }
}
```

### Output Protocol (stdout markers)

```
---NANOCLAW_OUTPUT_START---
{"status":"success","result":"...","newSessionId":"..."}
---NANOCLAW_OUTPUT_END---
```

Multiple outputs possible. Host parser extracts JSON between markers.

### MessageStream

Push-based async iterable that keeps the conversation alive:

```typescript
class MessageStream {
  push(text: string)    // Add user message (from IPC polling)
  end()                 // Signal no more messages
  [Symbol.asyncIterator]()
}
```

Prevents Claude SDK from treating it as single-turn by keeping the iterable open.

### Agent SDK Configuration

```typescript
query({
  initialMessage: prompt,
  sessionId: id,
  resumeSession: true,
  settingSources: ['project'],    // Auto-loads CLAUDE.md files
  mcpServers: { nanoclaw: customMcpServer },
  hooks: {
    PreToolUse: sanitizeBash,     // Strip credentials from env
    PreCompact: archiveTranscript  // Save transcript before compaction
  }
})
```

### MCP Tools Available to Agent

| Tool | Description |
|------|-------------|
| `send_message(jid, text, sender?)` | Send WhatsApp/Telegram message |
| `schedule_task(prompt, type, value, target_jid?)` | Create scheduled task |
| `list_tasks()` | List all scheduled tasks |
| `get_task(id)` | Get task details |
| `update_task(id, ...)` | Modify task |
| `pause_task(id)` | Pause task |
| `resume_task(id)` | Resume task |
| `cancel_task(id)` | Cancel task |
| `activate_group(jid)` | Switch to another group (main only) |
| `refresh_groups()` | Re-sync group list (main only) |

## Mount Structure

```
/workspace/
├── env-dir/env          # Auth secrets (read-only)
├── group/               # Current group folder (read-write, cwd)
├── project/             # Full project root (main only, read-write)
├── global/              # Global CLAUDE.md (non-main, read-only)
├── ipc/                 # Bidirectional communication (read-write)
│   ├── messages/        # Agent -> host: outgoing messages
│   ├── tasks/           # Agent -> host: task operations
│   ├── input/           # Host -> agent: follow-up messages (polled)
│   ├── current_tasks.json  # Read-only task snapshot
│   └── available_groups.json  # Group list (main only)
└── extra/               # Additional user-configured mounts
```

## IPC Communication

### Host -> Container

| Path | Purpose |
|------|---------|
| `/workspace/ipc/input/{id}.json` | Follow-up user messages (polled by agent) |
| `/workspace/ipc/input/_close` | Graceful shutdown sentinel |

### Container -> Host

| Path | Content |
|------|---------|
| `/workspace/ipc/messages/{id}.json` | `{"type":"message","chatJid":"...","text":"..."}` |
| `/workspace/ipc/tasks/{id}.json` | `{"type":"create_task","prompt":"...","schedule_type":"cron",...}` |

Host IPC watcher polls every 1 second, processes files, then deletes them.

**Authorization rules:**
- Main group can send messages to any group
- Non-main can only send to own group
- Main sees all tasks, non-main sees own only

## Container Lifecycle

```
1. Spawn: docker run -i --rm --user uid:gid ...
2. Input: JSON via stdin
3. Compile: TypeScript from /app/src to /tmp/dist
4. Execute: Agent SDK query loop
5. Stream: Results via stdout markers
6. Poll: /workspace/ipc/input/ for follow-up messages
7. Idle: Wait up to 30 minutes for more messages
8. Shutdown: _close sentinel or timeout -> SIGTERM -> cleanup
9. Cleanup: --rm flag auto-removes container
```

## Mount Security

**Allowlist location:** `~/.config/nanoclaw/mount-allowlist.json` (never mounted into containers)

```json
{
  "allowedRoots": [
    {"path": "~/projects", "allowReadWrite": true},
    {"path": "/var/repos", "allowReadWrite": false}
  ],
  "blockedPatterns": [".ssh", ".gnupg", "*.key", ".env", "credentials"],
  "nonMainReadOnly": true
}
```

**Validation:** Symlink resolution, path traversal prevention, blocked pattern matching.

## Concurrency

- **Global limit:** 5 concurrent containers (configurable)
- **Per-group:** FIFO queue, at most 1 active container per group
- **Waiting groups:** Processed in order when slots open
- **Follow-up messages:** Delivered via IPC while container active, no new spawn needed
