# NanoClaw Codebase Analysis

Complete analysis of the NanoClaw project for building a personal assistant focused on notes/documentation, reminders (Todoist), and work task management (Linear).

## What is NanoClaw?

NanoClaw is a **lightweight personal Claude assistant** that runs in containers and communicates via WhatsApp. It's a minimal, security-first alternative to OpenClaw with ~24K LoC (vs OpenClaw's ~569K).

**Key Stats:**
- ~117 TypeScript files, ~24K lines of code
- 9 runtime dependencies
- 11 Claude Code skills
- Single Node.js process + containerized agents
- MIT Licensed, Node.js >= 20

## Documentation Index

| # | File | Contents |
|---|------|----------|
| 1 | [Architecture](./01-architecture.md) | Full message flow, component diagram, data flow |
| 2 | [Source Code](./02-source-code.md) | Every file explained, key data structures |
| 3 | [Container System](./03-container-system.md) | Agent runner, mounts, IPC, security |
| 4 | [Skills & Setup](./04-skills-and-setup.md) | All 11 skills, setup process, skills engine |
| 5 | [Product Plan](./05-product-plan.md) | What to build for notes, Todoist, Linear |

## Quick Reference

- **Entry point:** `src/index.ts` (488 lines - main orchestrator)
- **WhatsApp:** `src/channels/whatsapp.ts` (Baileys integration)
- **Database:** `src/db.ts` (SQLite - messages, chats, tasks, sessions)
- **Container spawn:** `src/container-runner.ts` (mount building, streaming output)
- **Queue:** `src/group-queue.ts` (per-group FIFO, 5 concurrent max)
- **IPC:** `src/ipc.ts` (file-based host<->container communication)
- **Scheduler:** `src/task-scheduler.ts` (cron/interval/once)
- **Agent runner (in container):** `container/agent-runner/src/index.ts`
- **MCP tools (in container):** `container/agent-runner/src/ipc-mcp-stdio.ts`
- **Config:** `src/config.ts` (69 lines, all constants)
- **Types:** `src/types.ts` (Channel interface, message types)
- **Global memory:** `groups/global/CLAUDE.md`
- **Main admin memory:** `groups/main/CLAUDE.md`
