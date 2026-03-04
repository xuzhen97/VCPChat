# VCPChat TASK_DONE Orchestration Design

Date: 2026-03-04
Status: Approved
Scope: Automatic task-completion judgment and auto-continue orchestration for single chat and group chat

## Problem Statement

Even after stream completion semantics were standardized, a request can still end before the underlying user task is truly completed. Users must manually ask the model to continue.

Current completion state (`completion_state=completed`) reflects generation flow completion, not guaranteed task completion.

## Goals

1. Distinguish "generation ended" from "task done".
2. Automatically continue when task is not done yet.
3. Keep behavior consistent in single chat and group chat.
4. Prevent infinite loops and uncontrolled retries.

## Non-Goals

1. No perfect semantic understanding of every task type.
2. No complex planner-agent framework.
3. No major UI redesign.

## Recommended Strategy: Dual-Signal (Explicit + Heuristic Fallback)

Use a two-layer decision model:

1. Primary signal: explicit completion marker (`TASK_DONE` or structured `task_done=true`)
2. Fallback signal: heuristic judgment when explicit marker is missing

This balances reliability and robustness against model formatting drift.

## Architecture

Introduce a renderer-side orchestration component: `TaskDoneOrchestrator`.

### Inputs

- `completion_state`
- `finish_reason`
- `end_source`
- `has_content`
- final message text
- request context (`agentId/groupId/topicId/messageId`)

### Decision Order

1. Check explicit done marker
2. If no explicit marker, run heuristic evaluation
3. If not done or uncertain, trigger auto-continue

### State Machine (per message/request)

- `idle`
- `evaluating`
- `auto_continuing`
- terminal: `done` or `halted`

Tracked fields:

- `attemptCount`
- `isAutoContinuing`
- `lastCompletionState`
- `lastDecision`
- `errorCount`

## Completion Signals

### Explicit Signal (highest priority)

Preferred forms:

1. Structured marker in response tail (recommended): e.g. `{"task_done": true}`
2. Fallback plain marker: `TASK_DONE`

If explicit signal is detected, stop auto-continue immediately.

### Heuristic Fallback

Only used when explicit signal is absent.

Heuristic evaluates:

1. Completion state (strong prior when `completion_state=completed`)
2. Positive finish language (done/summary/completed wording)
3. Negative unfinished cues (remaining steps/continue next/incomplete wording)

Decision classes:

- `done`
- `not_done`
- `uncertain`

## Auto-Continue Policy

Trigger auto-continue when:

1. `completion_state in {truncated, unknown}`
2. `completion_state=completed` but heuristic says `not_done` or `uncertain`

Do not auto-continue when:

1. explicit `TASK_DONE`
2. user interrupted
3. max attempts reached
4. error threshold reached

## Continue Prompt Contract

Use a fixed continuation prompt template appended to next request:

1. Continue from interruption point
2. Do not repeat completed parts
3. First list remaining unfinished items
4. Finish all remaining items
5. Output `TASK_DONE` once fully complete

This reduces repetition and increases deterministic completion detection.

## Safety Controls

1. `maxAutoContinue` default: 3
2. `maxErrorRetries` default: 2
3. exponential backoff for transient failures: 1s, 2s, 4s
4. per-message mutex (`isAutoContinuing`) to avoid duplicate continuations
5. hard stop on user interrupt

## UX and Observability

Show lightweight status feedback:

1. "自动续写中（第 n 次）"
2. "任务已判定完成"
3. "已达自动续写上限，请手动处理"

Log per attempt:

- `attempt`
- `completion_state`
- `decision`
- signal source (`explicit` or `heuristic`)
- stop reason

## Testing Strategy

### Unit Tests

1. explicit `TASK_DONE` => stop
2. no explicit marker + heuristic `done` => stop
3. heuristic `not_done/uncertain` => continue
4. max attempts reached => halt
5. error threshold reached => halt

### Integration Tests

1. `truncated -> auto-continue -> TASK_DONE`
2. `completed but not_done -> auto-continue`
3. single and group chat parity
4. user interrupt immediately cancels orchestrator

## Acceptance Criteria

1. Users no longer need manual "continue" in common truncation/interruption scenarios.
2. Auto-continue never loops infinitely.
3. Explicit `TASK_DONE` reliably ends orchestration.
4. Single chat and group chat behavior is consistent.

## Risks and Mitigations

1. Risk: model omits explicit marker.
- Mitigation: heuristic fallback + bounded retries.

2. Risk: heuristic false positives.
- Mitigation: conservative multi-condition decision; prefer `uncertain -> continue` within limits.

3. Risk: repeated content across continuations.
- Mitigation: fixed continue prompt contract and remaining-items-first format.
