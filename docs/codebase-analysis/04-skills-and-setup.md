# 4. Skills & Setup

## Available Skills (11)

### Core Skills

| Skill     | Command      | Purpose                            |
| --------- | ------------ | ---------------------------------- |
| Setup     | `/setup`     | First-time installation (11 steps) |
| Customize | `/customize` | Interactive behavior modification  |
| Debug     | `/debug`     | Container/auth/IPC troubleshooting |

### Channel Skills

| Skill    | Command                    | Adds                       | Dependencies                          |
| -------- | -------------------------- | -------------------------- | ------------------------------------- |
| Telegram | `/add-telegram`            | `src/channels/telegram.ts` | `grammy`                              |
| Discord  | `/add-discord`             | `src/channels/discord.ts`  | `discord.js`                          |
| Gmail    | `/add-gmail`               | Email tool/channel         | `@gongrzhe/server-gmail-autoauth-mcp` |
| Voice    | `/add-voice-transcription` | `src/transcription.ts`     | `openai`                              |

### Advanced Skills

| Skill           | Command                       | Purpose                              |
| --------------- | ----------------------------- | ------------------------------------ |
| Telegram Swarm  | `/add-telegram-swarm`         | Multi-agent teams via bot pool       |
| Parallel        | `/add-parallel`               | Parallel Search + Deep Research APIs |
| X Integration   | `/x-integration`              | Twitter via Playwright automation    |
| Apple Container | `/convert-to-apple-container` | Docker -> Apple Container runtime    |

## Skill Details

### `/setup` - 11 Steps

1. Bootstrap: detect Node.js, install dependencies
2. Environment: check existing config, available runtimes
3. Container Runtime: Docker or Apple Container
4. Claude Authentication: OAuth or API key -> `.env`
5. WhatsApp Authentication: QR code, pairing code, or QR-browser
6. Trigger & Channel: prompt for trigger word
7. Group Sync & Selection: list and choose groups
8. Register Channel: store in SQLite
9. Mount Allowlist: configure external dir access
10. Service Installation: launchd (macOS) or systemd (Linux)
11. Verification: test all components

### `/add-telegram`

- Creates `src/channels/telegram.ts` implementing Channel interface
- Three-way merges into `src/index.ts` and `src/config.ts`
- Can replace WhatsApp or run alongside
- Supports `/chatid` command for group discovery
- Guides user through BotFather setup and group privacy settings

### `/add-discord`

- Creates `src/channels/discord.ts` (DiscordChannel class)
- Requires Message Content Intent and Server Members Intent
- OAuth2 with Bot scope + Send Messages + Read History
- Channel ID format: `dc:<channel-id>`

### `/add-gmail`

- **Tool mode:** Agent reads/sends emails when triggered from chat
- **Channel mode:** Emails trigger agent, replies go back as email
- Uses Google OAuth2 credentials via MCP server
- Mounts Gmail credentials in container

### `/add-voice-transcription`

- OpenAI Whisper API for voice-to-text (~$0.003-0.006 per 30s)
- Detects voice messages in WhatsApp channel
- Delivers as `[Voice: <transcript>]` to agent
- Creates `src/transcription.ts` module

### `/add-telegram-swarm`

- Each subagent gets own bot identity in Telegram group
- Bot pool with round-robin assignment
- `TELEGRAM_BOT_POOL=TOKEN1,TOKEN2,TOKEN3,...`
- MCP `send_message` accepts `sender` parameter

### `/add-parallel`

- Parallel Search API (free, 2-5s, factual lookups)
- Parallel Task API (paid, 1-20min, deep research)
- Deep research uses scheduler polling (non-blocking)

## Skills Engine

Located in `skills-engine/`. Provides deterministic code transformation.

### How Skills Are Applied

1. Initialize `.nanoclaw/` directory and `state.yaml`
2. Read and validate skill manifest (`SKILL.toml`)
3. Backup current project state
4. Execute file operations (copy, create, delete)
5. Three-way merge for existing files (git rerere for conflicts)
6. Handle structured merges (package.json, .env, docker-compose)
7. Update state tracking (applied skills, file hashes)
8. Run validation (tests, build)

### Key Modules

| Module          | Purpose                                           |
| --------------- | ------------------------------------------------- |
| `apply.ts`      | Main orchestrator                                 |
| `manifest.ts`   | Parse SKILL.toml                                  |
| `merge.ts`      | Three-way merge with conflict resolution          |
| `state.ts`      | Track applied skills, rollback capability         |
| `structured.ts` | Structured file merges (env, npm, docker-compose) |
| `uninstall.ts`  | Safe skill removal                                |
| `update.ts`     | Update skills to newer versions                   |
| `rebase.ts`     | Rebase on new base code                           |
| `replay.ts`     | Replay all skills from history                    |
| `backup.ts`     | Full project backup/restore                       |

### Intent Files

When merge conflicts occur, the engine writes intent files explaining what changed and why, with example output for developer approval.

## Setup Infrastructure

Located in `setup/`:

| File               | Purpose                          |
| ------------------ | -------------------------------- |
| `index.ts`         | Entry point, routes to steps     |
| `platform.ts`      | OS detection, Node.js version    |
| `environment.ts`   | Existing config check            |
| `container.ts`     | Docker/Apple Container setup     |
| `whatsapp-auth.ts` | WhatsApp auth (3 methods)        |
| `groups.ts`        | Group listing and sync           |
| `register.ts`      | Group registration               |
| `mounts.ts`        | Mount allowlist config           |
| `service.ts`       | launchd/systemd service creation |
| `verify.ts`        | Full health check                |

## CLAUDE.md Memory Files

| Location                  | Scope      | Purpose                                   |
| ------------------------- | ---------- | ----------------------------------------- |
| `/CLAUDE.md`              | Project    | Architecture overview for Claude Code     |
| `groups/global/CLAUDE.md` | All groups | Global persona, capabilities, constraints |
| `groups/main/CLAUDE.md`   | Admin only | Extended capabilities, project access     |
| `groups/{name}/CLAUDE.md` | Per group  | Custom behavior for that group            |

## Tests

| File                                | Coverage                                      |
| ----------------------------------- | --------------------------------------------- |
| `src/channels/whatsapp.test.ts`     | WhatsApp behavior, voice transcription        |
| `setup/platform.test.ts`            | OS detection                                  |
| `setup/register.test.ts`            | Group registration                            |
| `setup/service.test.ts`             | Service file generation                       |
| `setup/environment.test.ts`         | Runtime detection                             |
| `skills-engine/__tests__/*.test.ts` | Apply, merge, manifest, state, rebase, replay |
