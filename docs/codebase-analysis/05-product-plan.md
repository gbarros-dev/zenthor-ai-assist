# 5. Product Plan - Personal Assistant for Notes, Reminders, and Work Management

## Product Vision

A personal AI assistant accessible via WhatsApp (and optionally Telegram/Discord) focused on:

1. **Notes & Documentation** - Capture, organize, search, and retrieve notes and documents
2. **Reminders via Todoist** - Create, manage, and track tasks/reminders through Todoist
3. **Work Management via Linear** - Manage issues, track priorities, and stay on top of work

## What NanoClaw Already Provides

| Need                | NanoClaw Status               | Gap                           |
| ------------------- | ----------------------------- | ----------------------------- |
| WhatsApp messaging  | Built-in                      | None                          |
| Telegram/Discord    | Available via skills          | None                          |
| Per-group memory    | CLAUDE.md files               | Basic - no structured notes   |
| Scheduled tasks     | Built-in (cron/interval/once) | Good foundation for reminders |
| Container isolation | Built-in                      | None                          |
| Session persistence | Built-in (SQLite)             | None                          |
| MCP tool framework  | Built-in (ipc-mcp-stdio)      | Easy to extend                |

## What Needs to Be Built

### 1. Notes & Documentation System

**Approach:** MCP tools + SQLite storage + markdown files

**New MCP tools:**

- `create_note(title, content, tags[])` - Create a new note
- `search_notes(query, tags[])` - Full-text search across notes
- `get_note(id)` - Retrieve a specific note
- `update_note(id, content?, tags?)` - Update existing note
- `list_notes(tags?, limit?)` - Browse notes
- `delete_note(id)` - Delete a note
- `append_to_note(id, content)` - Append to existing note

**Storage:** SQLite table with FTS5 for full-text search + markdown files in `groups/{group}/notes/`

```sql
notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  tags TEXT,            -- JSON array
  group_folder TEXT,    -- Which group created it
  created_at TEXT,
  updated_at TEXT
)
-- FTS5 virtual table for search
notes_fts (title, content, tags)
```

**File-based backup:** Each note also saved as markdown in `groups/{group}/notes/{slug}.md` for human readability and CLAUDE.md context.

### 2. Todoist Integration

**Approach:** MCP server wrapping the Todoist REST API v2

**Dependencies:** `@doist/todoist-api-typescript` or direct REST calls

**Environment:** `TODOIST_API_TOKEN` in `.env`

**New MCP tools:**

- `todoist_create_task(content, due_string?, priority?, project?, labels[])` - Create task
- `todoist_list_tasks(filter?, project?)` - List active tasks
- `todoist_complete_task(id)` - Complete a task
- `todoist_update_task(id, content?, due_string?, priority?)` - Update task
- `todoist_get_projects()` - List projects
- `todoist_delete_task(id)` - Delete task

**Integration with scheduler:** Agent can create NanoClaw scheduled tasks that check Todoist for due items and send reminders proactively.

**Todoist API:** https://developer.todoist.com/rest/v2/

### 3. Linear Integration

**Approach:** MCP server wrapping the Linear GraphQL API

**Dependencies:** `@linear/sdk` or direct GraphQL calls

**Environment:** `LINEAR_API_KEY` in `.env`

**New MCP tools:**

- `linear_list_issues(status?, assignee?, priority?, team?)` - List issues
- `linear_get_issue(id)` - Get issue details
- `linear_create_issue(title, description?, team, priority?, status?)` - Create issue
- `linear_update_issue(id, status?, priority?, assignee?)` - Update issue
- `linear_add_comment(issue_id, body)` - Add comment
- `linear_list_projects()` - List projects
- `linear_my_issues()` - Issues assigned to me

**Smart features the agent can provide:**

- Daily standup summary via scheduled task
- Priority triage: "What should I work on next?"
- Status updates: "Update Linear - finished the auth refactor"
- Sprint overview: "How's the sprint looking?"

## Implementation Order

### Phase 1: Notes System

1. Add `notes` table to `src/db.ts` with FTS5
2. Add note MCP tools to `container/agent-runner/src/ipc-mcp-stdio.ts`
3. Add IPC handler for notes operations in `src/ipc.ts`
4. Update `groups/global/CLAUDE.md` with note-taking instructions
5. Test via WhatsApp

### Phase 2: Todoist Integration

1. Add `TODOIST_API_TOKEN` to container env passthrough (`src/container-runner.ts`)
2. Create Todoist MCP tools (either in ipc-mcp-stdio or as separate MCP server)
3. Add scheduled task for daily reminder check
4. Update CLAUDE.md with Todoist usage instructions
5. Test creating/completing tasks via WhatsApp

### Phase 3: Linear Integration

1. Add `LINEAR_API_KEY` to container env passthrough
2. Create Linear MCP tools
3. Add scheduled task for daily standup summary
4. Update CLAUDE.md with Linear usage instructions
5. Test issue management via WhatsApp

### Phase 4: Polish

1. Cross-feature: "Create a Linear issue from this note"
2. Smart reminders: "Remind me about issue LIN-123 tomorrow"
3. Context awareness: Agent remembers what you discussed and links to relevant notes/tasks
4. Multi-channel: Add Telegram or Discord if needed

## Architecture Decision: Where to Put MCP Tools

**Option A: Extend ipc-mcp-stdio.ts** (recommended for notes)

- Notes are local data, same pattern as tasks
- IPC writes to /workspace/ipc/, host processes
- No external API calls from container

**Option B: Separate MCP servers** (recommended for Todoist/Linear)

- External API calls, better isolation
- Can use existing community MCP servers
- Configure in agent-runner's mcpServers config
- Credentials mounted via container env

**Option C: Hybrid** (recommended overall)

- Notes: extend ipc-mcp-stdio (local data)
- Todoist: direct API calls from container (simple REST)
- Linear: direct API calls from container (@linear/sdk)

## Rebranding Notes

When forking NanoClaw for your product:

1. `package.json` - name, description
2. `src/config.ts` - ASSISTANT_NAME default, paths
3. Container image name
4. `groups/global/CLAUDE.md` - persona and capabilities
5. `groups/main/CLAUDE.md` - admin instructions
6. Service name (launchd/systemd)
7. IPC directory name
8. README and docs
