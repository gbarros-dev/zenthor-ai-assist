# pi-mono + Convex Refactor Logic

## Objective

Refactor Zenthor so:

1. `pi-mono` (`@mariozechner/pi-agent-core`) is the main agent loop runtime.
2. Convex is the source of truth for persistence and queue state.
3. The current SQLite polling loop in `apps/ai-agent` is removed or minimized to channel I/O only.

## Decision Applied

We are implementing **option 2** from this plan:

- `pi-mono` loop runs in a **separate worker service** (`apps/agent-worker`).
- Convex remains the durable queue + persistence layer.
- In-Convex `agent.processJob` is no longer the primary execution path.

## Current State (Important Baseline)

### Loop and persistence are split
- `apps/ai-agent/src/index.ts` runs a polling loop and orchestrates agent execution.
- `apps/ai-agent/src/db.ts` stores chats/messages/sessions/groups/tasks in SQLite.
- `apps/backend/convex/agent.ts` already has a separate Convex queue-based loop for web chat, but uses direct Anthropic SDK calls (not pi-agent-core).

### Existing Convex pieces we can reuse
- `conversations`, `messages`, `agentQueue` tables already exist.
- `messages.send` enqueues `agentQueue` jobs for worker pickup.
- web UI is already wired to Convex (`useConvexChat`).

This means the shortest path is: replace Convex `agent.processJob` internals first, then migrate WhatsApp from SQLite to Convex.

## What "pi-mono as main loop" means here

Use `@mariozechner/pi-agent-core` as the orchestration engine for each queued job:
- context assembly,
- model streaming,
- tool execution,
- event-driven state updates.

Convex remains responsible for:
- durable queue state,
- durable message state,
- idempotent retries,
- scheduling,
- real-time subscriptions to clients.

## Target Architecture

```text
Web UI / WhatsApp Adapter
        |
        v
Convex mutations (ingest/send)
        |
        v
agentQueue (pending job)
        |
        v
External worker service (`apps/agent-worker`) (pi-agent-core loop)
        |
        +--> stream deltas -> messages.updateStreamingContent
        +--> finalize -> messages.finalizeMessage + agentQueue.complete
        +--> fail -> messages.failMessage + agentQueue.fail
        |
        v
Outbound table/stream for channel adapters (WhatsApp sender)
```

## Refactor Phases

## Current Implementation Status

Implemented now:

1. Convex enqueue path no longer schedules in-Convex execution in `messages.send`.
2. New internal Convex worker API in `convex/agentWorker.ts`:
   - `claimNextPendingJob`
   - `updateStreamingContent`
   - `completeJob`
   - `failJob`
3. New standalone worker service at `apps/agent-worker` using:
   - `ConvexHttpClient` admin auth (`CONVEX_DEPLOY_KEY`)
   - `@mariozechner/pi-agent-core` for the loop
   - `@mariozechner/pi-ai` model registry and streaming

To run the worker:

```bash
bun run --cwd apps/agent-worker dev
```

Required env vars:
- `CONVEX_URL` (or `NEXT_PUBLIC_CONVEX_URL`)
- `CONVEX_DEPLOY_KEY`
- One Anthropic credential:
  - `ANTHROPIC_API_KEY`, or
  - `ANTHROPIC_OAUTH_TOKEN`, or
  - `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`)
- Optional: `ANTHROPIC_MODEL`, `AGENT_WORKER_ID`, `AGENT_WORKER_POLL_INTERVAL_MS`, `AGENT_WORKER_CONTEXT_LIMIT`

## Phase 1: Make pi-agent-core the external worker loop (Web first)

### Changes
- Add backend deps:
  - `@mariozechner/pi-agent-core`
  - `@mariozechner/pi-ai`
- Add `apps/backend/convex/agentWorker.ts`:
  - claim pending jobs atomically.
  - provide worker-safe streaming/finalization/failure mutations.
- Add `apps/agent-worker` service:
  - initialize `ConvexHttpClient` with admin auth.
  - run `new Agent(...)` loop for each claimed job.
  - stream deltas back to Convex and finalize/fail jobs.

### Behavior rules
- Claim job idempotently (`pending -> processing` only once).
- Always create assistant placeholder before streaming.
- On completion:
  - finalize message with full content + model used.
  - mark queue row `completed`.
- On error:
  - mark assistant placeholder failed.
  - mark queue row `failed` with error message.

### Why phase this way
- No channel migration required.
- web chat keeps working while execution moves out of Convex runtime.

## Phase 2: Expand Convex schema for channel-native persistence

Current schema is web-oriented; add channel bridge tables so WhatsApp can use Convex as primary persistence.

### New/updated tables (proposed)
- `channelChats`
  - `channel` (`"whatsapp" | "web" | ...`)
  - `externalChatId` (jid for WhatsApp)
  - `conversationId`
  - indexes: `by_channel_external`, `by_conversation`
- `channelMessages`
  - `channel`, `externalMessageId`, `conversationId`, `senderId`, `senderName`, `rawTimestamp`, `direction`
  - dedupe index: `by_channel_external_message`
- `agentSessions`
  - `conversationId`, `providerSessionId`, `lastUsedAt`
- `scheduledTasks`, `taskRunLogs`
  - migrate equivalent fields from SQLite
- Optional `outboundQueue`
  - durable outgoing messages for adapters (status: pending/sent/failed)

### Keep/reuse
- keep `conversations`, `messages`, `agentQueue`.

## Phase 3: Replace SQLite ingest loop with Convex ingest mutations

### New backend functions
- Internal mutation `channel.ingestMessage` (authorized by secret/signature)
  - idempotent insert using `channelMessages` dedupe key.
  - upsert/find `conversationId` by `channel + externalChatId`.
  - persist user message in `messages`.
  - evaluate trigger logic (main group bypass, non-main requires mention).
  - enqueue `agentQueue` + schedule `agent.processJob` when required.

- Internal query/mutation pair for outbound delivery
  - adapter fetches pending outbound for channel.
  - adapter ACKs delivery/failure.

### ai-agent app changes
- `apps/ai-agent` keeps only channel adapter responsibilities:
  - receive WhatsApp events,
  - call Convex `channel.ingestMessage`,
  - send outbound messages from Convex queue,
  - ACK results.
- Retire SQLite-specific modules gradually:
  - `db.ts`, polling `startMessageLoop`, local scheduler loop.

## Phase 4: Move scheduler fully to Convex

- Implement task mutations/queries/actions in `apps/backend/convex`.
- Use `ctx.scheduler` for execution timing instead of local polling.
- Each task run inserts `taskRunLogs` and updates `scheduledTasks.nextRun`.
- For recurring tasks, schedule next run at the end of each execution.

## Phase 5: Cutover and cleanup

- Stop dual-write.
- Remove SQLite migration shims.
- Remove orphaned queue/IPC code not used by Convex path.
- Keep optional compatibility adapter only if needed.

## Main Loop Pseudocode (pi-agent-core in external worker)

```ts
claim = claimNextPendingJob(workerId)
if !claim: sleep(pollInterval); continue

history = claim.messages
  piMessages = toPiMessages(history)

  agent = new Agent({
    initialState: {
      systemPrompt,
      model: getModel(provider, modelName),
      messages: piMessages,
      tools,
    },
  })

  subscribe(agent, throttledMessageDeltaHandler)

  try:
    await agent.continue()
    final = readFinalAssistantText(agent.state)
    completeJob(claim.jobId, claim.assistantMessageId, final, modelName)
  catch (e):
    failJob(claim.jobId, claim.assistantMessageId, errorToString(e))
```

## Data Migration Strategy (SQLite -> Convex)

Run as one-time script:

1. Export from SQLite tables:
   - `chats`, `messages`, `registered_groups`, `sessions`, `scheduled_tasks`, `task_run_logs`.
2. Import in batches via internal Convex mutations (idempotent by natural keys).
3. Verify counts per table and random sample integrity.
4. Enable dual-write during a burn-in window.
5. Switch reads to Convex only.

## Operational Guardrails

- Idempotency:
  - inbound dedupe by `(channel, externalMessageId)`.
  - queue claim must be atomic and status-checked.
- Concurrency:
  - one active job per conversation (enforce via query + status index).
- Retries:
  - exponential backoff for failed queue jobs.
- Observability:
  - structured logs for job lifecycle and channel delivery lifecycle.
- Backpressure:
  - cap context window and trim message history before building agent context.

## Recommended File-Level Execution Plan

1. `apps/backend/package.json`
   - add pi dependencies.
2. `apps/backend/convex/agent.ts`
   - migrate loop to pi-agent-core.
3. `apps/backend/convex/schema.ts` + `apps/backend/convex/schemas/*`
   - add channel/task/session tables.
4. `apps/backend/convex/channel*.ts` (new)
   - ingestion/outbound API for adapters.
5. `apps/ai-agent/src/channels/whatsapp.ts` + new Convex bridge module
   - swap local DB writes for Convex ingest + outbound ACK flow.
6. remove/retire SQLite loop modules after cutover.

## Placement Decision (Resolved)

Two viable placements were considered:

1. Convex internal action.
2. External worker process consuming Convex queue.

The chosen implementation is **external worker process** to keep `pi-mono` as the main loop runtime and preserve flexibility for richer runtime capabilities.
