# Zenthor AI Assist

Zenthor AI Assist is a monorepo that combines a web app, a Convex backend, a background agent worker, and an optional terminal client (TUI).

The current implementation is centered on a message queue workflow:

- web and TUI clients create user messages
- messages are enqueued in `agentQueue`
- a dedicated worker claims jobs and generates assistant responses
- responses are streamed back into the shared data model

## Repository layout

- `apps/web` – Next.js 16 frontend (React/Clerk/Convex)
- `apps/backend` – Convex backend (schemas, auth, queries/mutations/actions, queue internals)
- `apps/agent-worker` – Standalone worker process that drains the queue
- `apps/tui` – Interactive terminal client with optional Convex sync
- `packages/tools` – Shared AI tools (web search/fetch, todoist, memory)
- `packages/config`, `packages/env`, `packages/observability` – shared infra and utility packages

## Architecture at a glance

```text
User (Web UI / TUI)
      |
      v
 Convex API (apps/backend)
      |
      v
  messages -> agentQueue
      |
      v
Agent Worker (apps/agent-worker)
      |
      v
  Streaming updates + completion
      |
      v
  Convex messages table -> UI updates
```

## Contributor checklist

1. Make architecture-aware edits inside the owning app/package.
2. Add or update `README` docs when behavior changes.
3. Prefer small, typed, testable changes over broad refactors.
4. Run at least `bun run static-analysis` before handing off.
5. Keep keys and model/provider settings in environment files, never hard-coded.
6. Preserve existing queue semantics when changing worker behavior.

## What the system does today

1. Authenticated users interact via web UI (`apps/web`).
2. A message is saved in `messages` and a job is enqueued in `agentQueue`.
3. The worker (`apps/agent-worker`) polls Convex and claims the oldest pending job.
4. Worker builds conversation context and streams model output into the assistant message.
5. Final output is persisted and the job marked `completed`.

The app also supports Clerk-backed identity and note/conversation storage in Convex.

## Core components and contracts

### `apps/backend`

- Convex functions for chat messages and queue operations.
- Queue-oriented API in `convex/agentWorker.ts` and related internal helpers:
  - `claimNextPendingJob`
  - `updateStreamingContent`
  - `completeJob`
  - `failJob`
  - `getQueueHealth`
- Message flow API for users lives in Convex mutations/queries.
- Clerk JWT config and webhook handling are wired in Convex auth helpers.

### `apps/agent-worker`

- Polls Convex with `agentWorker:claimNextPendingJob`.
- Loads conversation context and runs the LLM agent with custom tools:
  - `webFetchTool`
  - `webSearchTool`
  - `todoistTool`
  - `memoryTool`
- Persists partial tokens in bounded streaming intervals.
- Handles retries and marks jobs failed only after retry budget is exhausted.

### `apps/tui`

- Local interactive terminal agent with provider/model auto-selection.
- Can mirror messages into Convex when `CONVEX_URL` + `CONVEX_ADMIN_KEY` are configured.
- Uses the same tooling as the worker for consistency.

### `apps/web`

- Next.js app with Clerk authentication and Convex client.
- Chat and notes UI call shared Convex-generated API bindings from `@zenthor-ai-assist/backend`.

## Reliability behavior (current implementation)

The queue worker now includes resilience fixes for production stability:

- Stale processing recovery:
  - Jobs stuck in `processing` for over 5 minutes are automatically recovered to `pending`.
- Retry policy:
  - Each claim increments `attempts`.
  - Default max attempts is **3** (`AGENT_WORKER_MAX_ATTEMPTS`).
  - Failing jobs are reset to `pending` while attempts remain.
  - After max attempts, job is marked failed and assistant placeholder is set to failed state.
- Context ordering fix:
  - Conversation context is fetched newest-first with `order("desc")`, limited, then reversed so agent receives correct chronological order.
- Streaming persistence:
  - Writes are batched by either size or time (200 chars or ~500ms) to avoid excessive writes while still staying responsive.

## Environment variables

Create env files in each app as needed.

General:

- `CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_URL` (web client)
- `CONVEX_ADMIN_KEY` (canonical)
- `CONVEX_DEPLOY_KEY` (legacy alias, still accepted with deprecation warning)

Backend (`apps/backend`):

- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `CLERK_WEBHOOK_SECRET`

Backend queue model/legacy path envs (if used):

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`

Agent worker (`apps/agent-worker`):

- `CONVEX_URL` or `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_ADMIN_KEY` or `CONVEX_DEPLOY_KEY`
- Anthropic credentials (one required):
  - `ANTHROPIC_OAUTH_TOKEN`
  - `CLAUDE_CODE_OAUTH_TOKEN`
  - `ANTHROPIC_API_KEY`
- Optional worker tuning:
  - `AGENT_WORKER_POLL_INTERVAL_MS` (default `1000`)
  - `AGENT_WORKER_CONTEXT_LIMIT` (default `50`)
  - `AGENT_WORKER_MAX_ATTEMPTS` (default `3`)
  - `AGENT_WORKER_ID` (defaults to hostname+pid)

TUI (`apps/tui`):

- Provider/model selection:
  - `ZENTHOR_AI_PROVIDER`, `ZENTHOR_MODEL`
  - `TUI_PROVIDER`, `TUI_MODEL`
  - `AI_PROVIDER`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`
  - `ZENTHOR_AI_STARTUP_INFO`, `ZENTHOR_TUI_STARTUP_INFO`
  - `ZENTHOR_AI_QUIET_STARTUP`, `ZENTHOR_AI_COMPACT_STARTUP`
- Credentials:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY` / `ANTHROPIC_OAUTH_TOKEN` / `CLAUDE_CODE_OAUTH_TOKEN`
  - Codex auth file (`~/.codex/auth.json` or `$CODEX_HOME/auth.json`) is also supported
- Convex sync (optional):
  - `CONVEX_URL`/`NEXT_PUBLIC_CONVEX_URL`
  - `CONVEX_ADMIN_KEY` or legacy `CONVEX_DEPLOY_KEY`

TUI tool integrations:

- `BRAVE_API_KEY` (web search)
- `TODOIST_API_TOKEN` (todoist tool)
- `PI_SKIP_VERSION_CHECK` (optional runtime flag)

## Setup and run

### Install

```bash
bun install
```

### Local development (recommended)

Run each service in a separate terminal:

```bash
# Backend (configure Convex and keep in sync)
bun run --cwd apps/backend dev:setup
bun run --cwd apps/backend dev

# Worker (required for async job processing)
bun run --cwd apps/agent-worker dev

# Web app
bun run --cwd apps/web dev

# Optional terminal client
bun run --cwd apps/tui dev
```

If you only need API/queue testing, run backend + worker first.
The web UI expects a healthy worker to receive generated responses.

## Useful workspace checks

From repo root:

```bash
bun run static-analysis
bun run build
bun run lint
bun run format:check
bun run typecheck
bun run test:run
```

`bun run static-analysis` is wired to run all lint/format/typecheck/knip checks through Turbo.

## Notes and current expectations

- The queue worker is required for assistant responses in web flows.
- The worker can run multiple instances; each worker can identify itself via `AGENT_WORKER_ID`.
- TUI can run independently as a local assistant; Convex sync is optional and does not block startup.
- Secrets in `.env*` files should be treated as local-only and must not be committed.
