# 1. Architecture

## System Overview

```
WhatsApp (baileys)
    |  (WebSocket)
SQLite Database (messages.db)
    |  (polled every 2s)
Message Loop (src/index.ts)
    |  (trigger match)
GroupQueue (per-group concurrency)
    |  (up to 5 concurrent)
Container (Docker / Apple Container)
    |  (stdin JSON -> stdout markers)
Agent Runner (Claude Agent SDK)
    |  (streaming results)
Router & IPC Watcher
    |  (sends responses)
WhatsApp
```

## Full Message Flow

### 1. Message Arrival (WhatsApp -> Database)

```
User sends WhatsApp message
  -> Baileys delivers via WebSocket
  -> WhatsAppChannel.onMessage() fires
  -> storeMessage() writes to SQLite messages table
  -> storeChatMetadata() updates chats table
```

### 2. Message Discovery (Polling Loop)

```
Every 2 seconds:
  -> getNewMessages(jids, lastTimestamp) queries SQLite
  -> For each message:
     - Is chat_jid in registeredGroups? If not: ignore
     - Is this the main group? Process all messages
     - Non-main: requires @AssistantName trigger
       - No trigger: store but don't process
       - Has trigger: fetch ALL messages since lastAgentTimestamp
```

### 3. Message Formatting & Queueing

```
formatMessages(messages) creates XML:
  <messages>
    <message sender="John" time="2026-02-22T10:30:00Z">Hello</message>
    <message sender="Sarah" time="2026-02-22T10:31:00Z">@Andy help</message>
  </messages>

GroupQueue.enqueueMessageCheck(chatJid):
  - Container active? -> queue as pendingMessages, deliver via IPC
  - At concurrency limit (5)? -> queue, add to waitingGroups
  - Otherwise: spawn container immediately
```

### 4. Container Execution

```
runContainerAgent(group, input, onProcess, onOutput)
  -> Build volume mounts:
     - groups/{name}/ -> /workspace/group (rw)
     - data/sessions/{group}/.claude/ -> /home/node/.claude/ (rw)
     - groups/global/ -> /workspace/global (ro, non-main)
     - data/ipc/{group}/ -> /workspace/ipc (rw)
     - container/agent-runner/src -> /app/src (ro)
     - [main only] project root -> /workspace/project
  -> Spawn: docker run -i --rm --user {uid}:{gid} ...
  -> Pass JSON input via stdin
  -> Stream stdout for OUTPUT markers
```

### 5. Agent Processing (Inside Container)

```
Entrypoint: compile TypeScript, run index.ts
  -> Read stdin JSON (prompt, sessionId, secrets)
  -> Create MessageStream (push-based async iterable)
  -> query() with Claude Agent SDK:
     - initialMessage, sessionId, resumeSession
     - settingSources: ['project'] (loads CLAUDE.md)
     - mcpServers: { zenthor: custom MCP }
     - hooks: PreToolUse (sanitize bash), PreCompact (archive)
  -> Stream results via OUTPUT_START/END markers
  -> Poll /workspace/ipc/input/ for follow-up messages
```

### 6. Output & Response

```
Container stdout:
  ---ZENTHOR_OUTPUT_START---
  {"status":"success","result":"...","newSessionId":"..."}
  ---ZENTHOR_OUTPUT_END---

Host parser:
  -> Extract JSON from markers
  -> channel.sendMessage(chatJid, text)
  -> Save newSessionId to sessions table
  -> Reset idle timer
```

### 7. Follow-Up Messages (While Container Active)

```
New message arrives while container running:
  -> GroupQueue.sendMessage(jid, text) writes JSON file
  -> /workspace/ipc/{group}/input/{id}.json
  -> Agent's polling loop picks up file
  -> File deleted, message injected into MessageStream
  -> Agent responds, streams back
```

### 8. Scheduled Tasks

```
Every 60 seconds:
  -> getDueTasks() queries SQLite
  -> For each due task:
     - Look up group, spawn container
     - Pass isScheduledTask: true
     - Stream results to group
     - Update next_run (cron/interval/once)
     - Log to task_run_logs
```

## Key Design Decisions

| Decision                 | Rationale                                                     |
| ------------------------ | ------------------------------------------------------------- |
| **Single process**       | No microservices, message queues, or orchestration overhead   |
| **Container isolation**  | OS-level security, not application-level permissions          |
| **File-based IPC**       | Simple, reliable, no external deps. Files in /workspace/ipc/  |
| **Polling (not events)** | 2s poll loop is simple, crash-recoverable, no missed messages |
| **SQLite**               | Single-file DB, no server, crash-safe, built into Node.js     |
| **Skills over plugins**  | Code modifications you own, not runtime plugin registry       |
| **Per-group sessions**   | Conversation continuity, memory isolation                     |
| **XML message format**   | Structured but readable, easy for LLM to parse                |

## Security Model

| Entity          | Trust Level | Why                              |
| --------------- | ----------- | -------------------------------- |
| Main group      | Trusted     | Private self-chat, admin control |
| Non-main groups | Untrusted   | Other users could be malicious   |
| Containers      | Sandboxed   | Filesystem & process isolation   |
| WhatsApp input  | Untrusted   | Potential prompt injection       |

### Isolation Layers

1. **Container** - Linux VM, only mounted paths visible, non-root user (uid 1000)
2. **Mount allowlist** - External file at `~/.config/zenthor/mount-allowlist.json`, never mounted into containers
3. **Session isolation** - Each group at `data/sessions/{group}/.claude/`, can't see others
4. **IPC authorization** - Main can send to any group, non-main only to own group
5. **Credential handling** - Passed via stdin, bash hook strips env vars from subprocesses
