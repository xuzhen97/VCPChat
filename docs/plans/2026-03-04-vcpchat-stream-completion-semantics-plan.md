# VCPChat Stream Completion Semantics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure only truly complete stream responses are marked as normal completion, with consistent completion semantics across single chat and group chat.

**Architecture:** Introduce a shared stream-completion mapping utility that converts transport-level end conditions into structured completion metadata. Update single-chat (`vcpClient`) and group-chat stream emitters to send standardized end payloads, then update renderer/stream manager to persist and render based on `completionState` rather than defaulting transport `end` to completed.

**Tech Stack:** Electron (main + renderer), Node.js CommonJS modules, existing VCP stream protocol, Node test runner (`node:test`).

---

### Task 1: Add failing tests for completion-state mapping utility

**Files:**
- Create: `tests/stream-completion-mapper.test.js`
- Modify: `tests/request-timeout-policy.test.js`

**Step 1: Write the failing test**

Add table-driven tests for a new utility API `mapStreamCompletion(input)` covering:
- done token + `finishReason='stop'` -> `completionState='completed'`
- done token + `finishReason='length'` -> `completionState='truncated'`
- done token + `finishReason='content_filter'` -> `completionState='truncated'`
- stream closed without finish reason -> `completionState='unknown'`
- abort/interrupted -> `completionState='interrupted'`
- http error -> `completionState='error'`
- stream read error -> `completionState='error'`

Example assertion shape:
```js
assert.deepEqual(mapStreamCompletion({
  endSource: 'done_token',
  finishReason: 'stop',
  interrupted: false,
  hasError: false,
  hasContent: true,
}), {
  completionState: 'completed',
  finishReason: 'stop',
  endSource: 'done_token',
  hasContent: true,
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/stream-completion-mapper.test.js`
Expected: FAIL because `modules/streamCompletionMapper.js` does not exist yet.

**Step 3: Keep timeout policy test as regression guard**

Ensure `tests/request-timeout-policy.test.js` still validates no timer-driven abort was reintroduced.

**Step 4: Run regression test file**

Run: `node --test tests/request-timeout-policy.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/stream-completion-mapper.test.js tests/request-timeout-policy.test.js
git commit -m "test: add failing coverage for stream completion mapping"
```

### Task 2: Implement shared completion mapping utility

**Files:**
- Create: `modules/streamCompletionMapper.js`
- Test: `tests/stream-completion-mapper.test.js`

**Step 1: Write minimal implementation**

Create utility with:
- `normalizeFinishReason(raw)`
- `mapStreamCompletion({ endSource, finishReason, interrupted, hasError, hasContent })`

Return object:
```js
{
  completionState,   // completed|truncated|interrupted|error|unknown
  finishReason,      // normalized or null
  endSource,         // done_token|stream_closed|abort|http_error|stream_error
  hasContent: Boolean
}
```

Rules:
- interrupted => `interrupted`
- hasError => `error`
- `endSource='done_token' && finishReason==='stop'` => `completed`
- `endSource='done_token' && finishReason && finishReason!=='stop'` => `truncated`
- otherwise => `unknown`

**Step 2: Run tests**

Run: `node --test tests/stream-completion-mapper.test.js`
Expected: PASS.

**Step 3: Commit**

```bash
git add modules/streamCompletionMapper.js tests/stream-completion-mapper.test.js
git commit -m "feat: add stream completion state mapper"
```

### Task 3: Integrate standardized completion metadata into single-chat stream emitter

**Files:**
- Modify: `modules/vcpClient.js`
- Test: `tests/vcpClient-stream-completion.test.js`

**Step 1: Write failing integration-style tests for payload shape**

Create/extend `tests/vcpClient-stream-completion.test.js` to stub stream chunks and assert emitted `type:'end'` payload includes:
- `completionState`
- `finish_reason` (or `finishReason` field, choose one canonical key and use consistently)
- `endSource`
- `hasContent`

Cover:
- `[DONE] + stop`
- stream closed without `[DONE]`
- abort path
- stream error path

**Step 2: Run tests to verify failure**

Run: `node --test tests/vcpClient-stream-completion.test.js`
Expected: FAIL on missing new fields.

**Step 3: Implement minimal code in `modules/vcpClient.js`**

- Track latest parsed chunk finish reason during stream loop.
- At `[DONE]` or `done` branch, call mapper and include metadata in end payload.
- In abort/error paths, emit end/error payloads that include mapped state metadata.
- Preserve existing behavior for chunk forwarding.

**Step 4: Run tests to verify pass**

Run: `node --test tests/vcpClient-stream-completion.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add modules/vcpClient.js tests/vcpClient-stream-completion.test.js
git commit -m "feat: add structured completion metadata to single-chat stream end"
```

### Task 4: Integrate same completion metadata into group-chat stream emitter

**Files:**
- Modify: `Groupmodules/groupchat.js`
- Test: `tests/groupchat-stream-completion.test.js`

**Step 1: Write failing tests for group end payload semantics**

Add tests that simulate group stream branches and assert end payload metadata consistency with single chat.
Include both main group send path and invited-agent path.

**Step 2: Run tests to verify failure**

Run: `node --test tests/groupchat-stream-completion.test.js`
Expected: FAIL on missing/inconsistent completion metadata.

**Step 3: Implement minimal code**

- Import shared mapper in group module.
- Track finish reason across chunk parsing.
- Replace ad-hoc `type:'end'` emissions with standardized metadata.
- Ensure branches that currently send `type:'end'` with `error` map to `completionState='error'` (or emit `type:'error'` consistently + metadata).

**Step 4: Run tests to verify pass**

Run: `node --test tests/groupchat-stream-completion.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add Groupmodules/groupchat.js tests/groupchat-stream-completion.test.js
git commit -m "feat: unify group-chat stream completion semantics"
```

### Task 5: Update renderer event handling to consume completion metadata

**Files:**
- Modify: `renderer.js`
- Test: `tests/renderer-stream-end-handling.test.js`

**Step 1: Write failing tests for end handling fallback behavior**

Add tests for event payload handling:
- New payload with `completionState='completed'` passes completed to finalizer.
- New payload with `completionState='truncated'` passes truncated to finalizer.
- Legacy `type:'end'` without metadata maps to `unknown` (not completed).

**Step 2: Run tests to verify failure**

Run: `node --test tests/renderer-stream-end-handling.test.js`
Expected: FAIL because code still defaults `finish_reason || 'completed'`.

**Step 3: Implement minimal code in `renderer.js`**

- In `onVCPStreamEvent`, read metadata fields from event payload.
- Replace `finish_reason || 'completed'` default with:
  - explicit completion state if present
  - legacy fallback `unknown`
- Pass structured final payload to `messageRenderer.finalizeStreamedMessage`.

**Step 4: Run tests to verify pass**

Run: `node --test tests/renderer-stream-end-handling.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add renderer.js tests/renderer-stream-end-handling.test.js
git commit -m "fix: stop defaulting stream end to completed in renderer"
```

### Task 6: Persist and surface completion state in stream manager

**Files:**
- Modify: `modules/renderer/streamManager.js`
- Modify: `modules/messageRenderer.js`
- Test: `tests/streamManager-finalization-state.test.js`

**Step 1: Write failing tests for persisted message state**

Assert finalization persists:
- `message.finishReason`
- `message.completionState`
- `message.endSource`

And preserves content fallback logic for group messages.

**Step 2: Run tests to verify failure**

Run: `node --test tests/streamManager-finalization-state.test.js`
Expected: FAIL on missing persisted fields.

**Step 3: Implement minimal code**

- Extend finalizer signature/`finalPayload` handling to carry completion metadata.
- Persist completion metadata on message object.
- Keep current rendering/markdown pipeline unchanged.

**Step 4: Run tests to verify pass**

Run: `node --test tests/streamManager-finalization-state.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add modules/renderer/streamManager.js modules/messageRenderer.js tests/streamManager-finalization-state.test.js
git commit -m "feat: persist stream completion state in message history"
```

### Task 7: End-to-end regression verification and docs update

**Files:**
- Modify: `docs/plans/2026-03-04-vcpchat-stream-completion-semantics-design.md`
- Optional Modify: `docs/plans/2026-03-04-vcpchat-stream-completion-semantics-plan.md`

**Step 1: Run full targeted test suite**

Run:
```bash
node --test \
  tests/request-timeout-policy.test.js \
  tests/stream-completion-mapper.test.js \
  tests/vcpClient-stream-completion.test.js \
  tests/groupchat-stream-completion.test.js \
  tests/renderer-stream-end-handling.test.js \
  tests/streamManager-finalization-state.test.js
```
Expected: all PASS.

**Step 2: Manual smoke checks**

- Single chat: normal stop should show completed.
- Single chat: forced token limit should show truncated.
- Group chat: same two cases should match single chat semantics.
- Manual interrupt should show interrupted.

**Step 3: Update design doc status notes**

Add a short "Implemented" section with final payload schema and any deviations.

**Step 4: Commit**

```bash
git add docs/plans/2026-03-04-vcpchat-stream-completion-semantics-design.md docs/plans/2026-03-04-vcpchat-stream-completion-semantics-plan.md
git commit -m "docs: record implementation outcomes for stream completion semantics"
```
