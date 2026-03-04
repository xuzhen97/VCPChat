# VCPChat Stream Completion Semantics Design

Date: 2026-03-04
Status: Approved
Scope: Single chat and group chat stream completion signaling and UI finalization semantics

## Problem Statement

VCPChat currently treats stream transport end (`type: 'end'`) as normal completion in many paths. This causes requests to appear "normally completed" even when the model stopped early (for example token limit, content filtering, unknown close, or other non-stop endings).

This affects both single chat and group chat.

## Goals

1. Only mark a message as normal completion when completion semantics explicitly indicate true completion.
2. Make single chat and group chat use one consistent completion-state contract.
3. Preserve backward compatibility for older end events without breaking rendering.
4. Make completion state testable and observable.

## Non-Goals

1. No semantic "task truly done" judging based on content quality.
2. No model-prompt redesign.
3. No unrelated UX redesign.

## Recommended Approach

Use protocol standardization for stream end metadata across single/group chat, then make renderer consume standardized fields instead of inferring completion from transport closure.

## Data Contract

For every stream end, emit structured metadata:

- `completionState`: `completed | truncated | interrupted | error | unknown`
- `finishReason`: normalized provider finish reason (`stop`, `length`, `content_filter`, etc.)
- `endSource`: `done_token | stream_closed | abort | http_error | stream_error`
- `hasContent`: boolean indicating meaningful generated content exists

## Mapping Rules

### Single Chat and Group Chat (same mapping)

1. Explicit done + `finish_reason=stop` -> `completionState=completed`
2. Explicit done + `finish_reason=length|content_filter|...` -> `completionState=truncated`
3. User interrupt/AbortError -> `completionState=interrupted`
4. HTTP non-2xx or stream read exception -> `completionState=error`
5. Stream closed without trustworthy finish reason -> `completionState=unknown`

## Architecture Changes

1. `modules/vcpClient.js`
- Track latest chunk `finish_reason` while parsing stream.
- Emit `type:'end'` with standardized completion metadata.

2. `Groupmodules/groupchat.js`
- Reuse same completion mapping logic as single chat.
- Replace "end with error but interpreted as complete" paths with standardized error/interrupted states.

3. `renderer.js`
- On `type:'end'`, stop defaulting to `completed`.
- Forward standardized completion fields into message finalization.

4. `modules/renderer/streamManager.js`
- Persist `completionState`, `finishReason`, and `endSource` to message history.
- Render UI completion labels using `completionState`, not transport end.

## Backward Compatibility

For old end payloads without `completionState`:

1. `type:'error'` still maps to `error`
2. `type:'end'` without completion metadata maps to `unknown` (not `completed`)

This avoids false positives while keeping legacy behavior functional.

## Error Handling Strategy

1. Never upgrade unknown end to completed.
2. Preserve original error text for diagnostics.
3. Keep manual interrupt UX behavior unchanged.

## Testing Plan

1. Unit tests for completion mapping:
- `stop`, `length`, `content_filter`, no finish reason, abort, HTTP error, stream error

2. Integration tests:
- Single chat and group chat both persist correct `completionState`
- Legacy end payload without metadata resolves to `unknown`

3. Regression checks:
- Manual interrupt still works
- Continue-writing/flowlock still works for `truncated`
- Non-streaming message flow unaffected

## Acceptance Criteria

1. "Normal completion" appears only when `completionState=completed`.
2. Single chat and group chat show identical completion semantics.
3. Users can distinguish completed/truncated/interrupted/error/unknown endings.
4. Tests cover completion-state mapping and persistence.

## Risks and Mitigations

1. Risk: Provider variants of finish reason differ.
- Mitigation: keep normalization table and unknown fallback.

2. Risk: Existing UI logic assumes binary complete/error.
- Mitigation: compatibility defaults + targeted regression tests.

3. Risk: Group chat has multiple stream branches.
- Mitigation: centralize mapping helper and reuse in all branches.
