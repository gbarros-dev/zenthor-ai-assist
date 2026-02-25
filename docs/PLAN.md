# Zenthor AI Assist — Implementation Plan

Personal AI assistant built on NanoClaw. Accessible via WhatsApp (and optionally Telegram/Discord).

## Product Focus

1. **Notes & Documentation** — Capture, organize, search, and retrieve notes
2. **Reminders via Todoist** — Create, manage, and track tasks/reminders
3. **Work Management via Linear** — Manage issues, track priorities (optional)

## What NanoClaw Already Provides

- WhatsApp messaging (built-in)
- Telegram/Discord (available via skills)
- Per-group memory (CLAUDE.md files)
- Scheduled tasks (cron/interval/once)
- Container isolation (Docker/Apple Container)
- Session persistence (SQLite)
- MCP tool framework (ipc-mcp-stdio)

---

## Phase 1: Notes System

**Goal:** MCP tools + SQLite storage + markdown file backup

### Database (src/db.ts)

Add `notes` table with FTS5 full-text search:

```sql
notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  tags TEXT,            -- JSON array
  group_folder TEXT,
  created_at TEXT,
  updated_at TEXT
)
-- FTS5 virtual table for search
notes_fts (title, content, tags)
```

### MCP Tools (container/agent-runner/src/ipc-mcp-stdio.ts)

| Tool                                  | Description                   |
| ------------------------------------- | ----------------------------- |
| `create_note(title, content, tags[])` | Create a new note             |
| `search_notes(query, tags[])`         | Full-text search across notes |
| `get_note(id)`                        | Retrieve a specific note      |
| `update_note(id, content?, tags?)`    | Update existing note          |
| `list_notes(tags?, limit?)`           | Browse notes                  |
| `delete_note(id)`                     | Delete a note                 |
| `append_to_note(id, content)`         | Append to existing note       |

### IPC Handler (src/ipc.ts)

Add note operations handler — same pattern as task IPC (agent writes JSON to `/workspace/ipc/notes/`, host processes).

### File Backup

Each note also saved as markdown in `groups/{group}/notes/{slug}.md` for human readability and CLAUDE.md context.

### Files to modify/create

- `src/db.ts` — add notes table, FTS5, CRUD queries
- `container/agent-runner/src/ipc-mcp-stdio.ts` — add note MCP tools
- `src/ipc.ts` — add notes IPC handler
- `groups/global/CLAUDE.md` — add note-taking instructions

---

## Phase 2: Todoist Integration

**Goal:** MCP tools wrapping the Todoist REST API v2

### Setup

- Add `TODOIST_API_TOKEN` to container env passthrough (`src/container-runner.ts`)
- Direct REST calls from inside the container (no external MCP server needed)

### MCP Tools

| Tool                                                                       | Description       |
| -------------------------------------------------------------------------- | ----------------- |
| `todoist_create_task(content, due_string?, priority?, project?, labels[])` | Create task       |
| `todoist_list_tasks(filter?, project?)`                                    | List active tasks |
| `todoist_complete_task(id)`                                                | Complete a task   |
| `todoist_update_task(id, content?, due_string?, priority?)`                | Update task       |
| `todoist_get_projects()`                                                   | List projects     |
| `todoist_delete_task(id)`                                                  | Delete task       |

### Proactive Reminders

Use NanoClaw's scheduled tasks to create a daily check that queries Todoist for due items and sends reminders via `send_message`.

### Files to modify/create

- `container/agent-runner/src/todoist.ts` — Todoist API client (~200 LoC)
- `container/agent-runner/src/ipc-mcp-stdio.ts` — register Todoist tools
- `src/container-runner.ts` — pass `TODOIST_API_TOKEN` to container env
- `groups/global/CLAUDE.md` — add Todoist usage instructions

---

## Phase 3: Linear Integration

**Goal:** MCP tools wrapping the Linear GraphQL API

### Setup

- Add `LINEAR_API_KEY` to container env passthrough
- Use `@linear/sdk` or direct GraphQL calls from container

### MCP Tools

| Tool                                                                 | Description           |
| -------------------------------------------------------------------- | --------------------- |
| `linear_list_issues(status?, assignee?, priority?, team?)`           | List issues           |
| `linear_get_issue(id)`                                               | Get issue details     |
| `linear_create_issue(title, description?, team, priority?, status?)` | Create issue          |
| `linear_update_issue(id, status?, priority?, assignee?)`             | Update issue          |
| `linear_add_comment(issue_id, body)`                                 | Add comment           |
| `linear_my_issues()`                                                 | Issues assigned to me |

### Smart Features

- Daily standup summary via scheduled task
- Priority triage: "What should I work on next?"
- Status updates: "Update Linear — finished the auth refactor"

### Files to modify/create

- `container/agent-runner/src/linear.ts` — Linear API client (~250 LoC)
- `container/agent-runner/src/ipc-mcp-stdio.ts` — register Linear tools
- `src/container-runner.ts` — pass `LINEAR_API_KEY` to container env
- `groups/global/CLAUDE.md` — add Linear usage instructions

---

## Phase 4: Write-Ahead Delivery Queue

**Goal:** Guarantee message delivery even if the host process crashes mid-response.

### The Problem

Currently, if the host crashes between parsing container output and calling `channel.sendMessage()`, the AI's response is lost. Cursor rollback helps with retries but doesn't guarantee delivery.

### The Solution

Persist outbound messages to disk before sending, delete after ACK. ~150 LoC, adapted from OpenClaw's `delivery-queue.ts`.

### Design

```
Agent responds → host parses output
  → enqueueDelivery(jid, text) — atomic write to data/delivery-queue/{id}.json
  → channel.sendMessage(jid, text)
  → ackDelivery(id) — delete file

On failure: increment retryCount, exponential backoff (5s, 25s, 2m, 10m)
On startup: recoverPendingDeliveries() — retry all unacked entries
After MAX_RETRIES (5): move to data/delivery-queue/failed/
```

### Files to modify/create

- `src/delivery-queue.ts` — queue logic (~150 LoC)
- `src/index.ts` — wrap `sendMessage()` calls with enqueue/ack
- `src/ipc.ts` — wrap IPC message delivery
- `src/delivery-queue.test.ts` — tests

---

## Phase 5: Rebranding

**Goal:** Make this project our own.

| What                      | Change                              |
| ------------------------- | ----------------------------------- |
| `package.json`            | name, description                   |
| `src/config.ts`           | `ASSISTANT_NAME` default, paths     |
| Container image name      | In build.sh and container-runner.ts |
| `groups/global/CLAUDE.md` | Persona and capabilities            |
| `groups/main/CLAUDE.md`   | Admin instructions                  |
| Service name              | launchd/systemd plist/service file  |
| `CLAUDE.md`               | Project-level context               |
| README                    | Product description                 |

---

## Implementation Order

```
Phase 1: Notes System         — Core feature, build first
Phase 2: Todoist Integration   — Second priority, enables reminders
Phase 4: Delivery Queue        — Can be done anytime, independent
Phase 3: Linear Integration    — Optional, do when needed
Phase 5: Rebranding            — Do whenever, cosmetic
```

Phases 1-3 follow the same pattern (add MCP tools + IPC handler) so each gets faster. Phase 4 is independent and can be slotted in at any point. Phase 5 is cosmetic and can happen first or last.

---

## Architecture Decision: Where MCP Tools Live

| Feature | Location                                                    | Reason                                                  |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Notes   | IPC-based (ipc-mcp-stdio.ts → host processes via IPC files) | Local data, host owns the DB                            |
| Todoist | Direct API from container (todoist.ts)                      | External API, simple REST, no host involvement needed   |
| Linear  | Direct API from container (linear.ts)                       | External API, SDK available, no host involvement needed |

Notes go through IPC because the host owns SQLite. Todoist and Linear call external APIs directly from the container — simpler, no IPC round-trip needed, credentials passed via container env.
