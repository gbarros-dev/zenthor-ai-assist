# Assessment: `apps/agent-worker` and `apps/tui`

Date: February 26, 2026  
Scope: `apps/agent-worker/`, `apps/tui/` and Convex worker integration points (`apps/backend/convex/*`)

## Executive assessment

The current implementation is a working baseline with a clean split between:

- `apps/tui`: interactive terminal agent.
- `apps/agent-worker`: background queue worker consuming Convex jobs and producing assistant responses.
- Convex mutations/queries as durable source of truth (`agentQueue`, `messages`, `conversations`).

It is functionally coherent and runnable, but not yet production-hardened.

Current maturity estimate: **7/10**.

## What is implemented

### `apps/agent-worker`
- Poll loop (`agentWorker:claimNextPendingJob`) with configurable poll interval and context limit.
- Uses `@mariozechner/pi-agent-core` for continuation and streaming.
- Writes incremental assistant output to Convex using `agentWorker:updateStreamingContent`.
- Writes final message content and model metadata via `agentWorker:completeJob`.
- Marks failed jobs via `agentWorker:failJob`.
- Loads local prompt context from `~/.zenthor/CLAUDE.md`.
- Uses shared tools:
  - `memoryTool`
  - `todoistTool`
  - `webFetchTool`
  - `webSearchTool`

### `apps/tui`
- Interactive session via `@mariozechner/pi-coding-agent`.
- Supports multi-provider model selection:
  - anthropic, openai, openai-codex.
- Optional Convex sync via admin-auth client:
  - `convex-sync.ts`
  - creates/fetches local TUI conversation
  - persists role/content/model on session end events
- Tooling parity with worker for shared capabilities.

### Convex integration used by both
- `apps/backend/convex/agentWorker.ts`: claim/stream/complete/fail API used by external worker.
- `apps/backend/convex/messages.ts`: user message send path enqueues `agentQueue`.
- `apps/backend/convex/schemas/*`: queue, message, conversation persistence.
- `apps/backend/convex/agentStatus.ts`: status query for active jobs.

## Capability summary

- End-to-end async queue processing: ✅
- Streaming assistant responses with persisted intermediate states: ✅
- Tool execution in generation path: ✅
- Multiple provider support in interactive mode: ✅
- Durable worker path for interactive mode: ⚪ (optional only)
- Recovery, retries, scheduling guardrails: ❌
- Deterministic modern context window behavior: ⚠️
- Clean production observability/operations model: ⚠️

## Recommended fixes (prioritized)

### P0 (Critical)

1. **Fix conversation context selection ordering**
   - Problem: queued claim path fetches context with ascending order + `take(contextLimit)` on `createdAt` index, which can return earliest messages instead of latest.
   - Impact: model receives stale history and misses recent turns.
   - Fix:
     - Query latest window first (descending + take), then reverse for chronological order before passing to agent.
   - Affected code:
     - `apps/backend/convex/agentWorker.ts` `claimNextPendingJob` message query.
     - Align similar logic in any other queue-processing path if used for generation.

2. **Add recovery for orphaned `processing` jobs**
   - Problem: no heartbeat/requeue path for crashed workers.
   - Impact: jobs can remain stuck forever and block further processing of the same conversation.
   - Fix:
     - Add `startedAt` TTL logic and watchdog mutation to requeue stale `processing` jobs.
     - Bump attempts and move back to `pending` after timeout.
     - Optionally enforce worker lease timeout and retry cap.
   - Affected code:
     - `apps/backend/convex/agentWorker.ts`
     - `apps/backend/convex/agentQueue` schema if new timeout metadata needed.

3. **Unify credential/env contract for worker startup**
   - Problem: docs/usage references may diverge (`CONVEX_DEPLOY_KEY` vs `CONVEX_ADMIN_KEY`).
   - Impact: setup and deployment failures.
   - Fix:
     - Normalize to one variable across docs, scripts, and runtime.
     - Keep one deprecated alias only with warning.
   - Affected code/docs:
     - `apps/agent-worker/src/index.ts`
     - `docs/PI_MONO_CONVEX_REFACTOR.md`
     - onboarding/run instructions (any env snippets).

### P1 (High)

4. **Resolve dual execution paths and de-risk duplication**
   - Problem: legacy in-Convex job path exists (`apps/backend/convex/agent.ts`) while external worker is canonical.
   - Impact: confusion and risk of accidental misuse.
   - Fix:
     - Document canonical execution path explicitly.
     - Mark old path deprecated with a safe guard to prevent invocation from active routes.
     - Consider removing legacy path once migration complete.
   - Affected code:
     - `apps/backend/convex/agent.ts`
     - any callers/wiring that might still invoke it.

5. **Worker retry and error semantics**
   - Problem: failure handling sets job as failed immediately; no controlled backoff/retry policy.
   - Impact: transient provider/network failures can become terminal losses.
   - Fix:
     - Add per-attempt retry with capped backoff.
     - Keep user-visible error only after final retry.
   - Affected code:
     - `apps/agent-worker/src/index.ts`
     - `apps/backend/convex/agentWorker.ts`

6. **Stream update backpressure + queue saturation handling**
   - Problem: streaming updates are queued via chained Promise; under long failures this can hide update backlog or delay cancellation semantics.
   - Impact: latency and harder operational debugging under heavy load.
   - Fix:
     - Add bounded queue or latest-only update policy.
     - Emit explicit warning on repeated failures after N attempts.
   - Affected code:
     - `apps/agent-worker/src/index.ts`
     - optionally `apps/backend/convex/agentWorker.ts:updateStreamingContent`.

### P2 (Medium)

7. **Close semantic parity between worker and TUI provider support**
   - Problem: worker currently enforces Anthropic only while TUI supports OpenAI/openai-codex.
   - Impact: inconsistent behavior by entrypoint.
   - Fix:
     - Either scope worker to Anthropic in docs and startup checks, or add multi-provider support for worker loop with provider-aware model registry.
   - Affected code:
     - `apps/agent-worker/src/index.ts`
     - `apps/agent-worker/package.json` if new providers are added.

8. **Improve observability**
   - Add structured logs for:
     - queue claim latency
     - tokens model choice
     - tool call failure counts
     - retry count and final failure cause
   - Affected code:
     - `apps/agent-worker/src/index.ts`
     - `apps/backend/convex/agentWorker.ts`
     - optional monitoring hooks consuming `agentStatus`/queue metrics.

### P3 (Nice-to-have)

9. **Message model consistency for sync path**
   - Normalize fields between worker output sync and TUI sync output (`modelUsed`, status fields, streaming lifecycle).
   - Ensure both paths produce equivalent audit trace.
   - Affected code:
    - `apps/backend/convex/messages.ts`
    - `apps/backend/convex/tuiSync.ts`
    - `apps/backend/convex/agentWorker.ts`

## Implementation ordering (practical)

1. Patch context-window bug + stale-processing recovery (P0 items).
2. Unify env naming and worker retry semantics.
3. Gate/mark legacy in-Convex path as non-primary.
4. Add observability and bounded streaming health metrics.
5. Decide whether worker parity with TUI provider support is needed now or later.

## Current implementation strengths

- Good modular split between generation runtime and UI mode.
- Durable persistence and queueing via Convex is already in place.
- Tool interfaces are reusable and coherent across both modes.
- Streaming is persisted, making partial responses visible and recoverable across refreshes.

## Current blind spots

- No orphaned-job recovery.
- No explicit operational runbooks for worker health/retry behavior.
- Possible user-visible inconsistency due to different provider capabilities in CLI vs background worker.
