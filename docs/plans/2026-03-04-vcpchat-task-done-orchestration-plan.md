# VCPChat TASK_DONE Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dual-signal TASK_DONE orchestration layer that auto-continues unfinished responses until task completion or bounded stop conditions.

**Architecture:** Introduce a renderer-side `TaskDoneOrchestrator` that consumes stream completion metadata and final message content, then decides `done/not_done/uncertain` using explicit marker first and heuristic fallback. Integrate it into the stream-end pipeline for both single and group chats, triggering bounded auto-continue with mutex, retry, and observability controls.

**Tech Stack:** Electron renderer/main IPC events, existing stream metadata (`completion_state`), Node.js modules, Node test runner (`node:test`).

---

### Task 1: Add failing tests for TASK_DONE signal parsing and decision rules

**Files:**
- Create: `tests/task-done-decision.test.js`
- Create: `tests/task-done-heuristic.test.js`

**Step 1: Write the failing test**

In `tests/task-done-decision.test.js`, add tests for a planned module API:

```js
const { detectExplicitTaskDone, decideTaskCompletion } = require('../modules/taskDoneSignals');

test('detectExplicitTaskDone should detect TASK_DONE token', () => {
  assert.equal(detectExplicitTaskDone('...TASK_DONE...'), true);
});

test('decideTaskCompletion should return done when explicit marker exists', () => {
  const result = decideTaskCompletion({
    completionState: 'truncated',
    text: 'TASK_DONE',
  });
  assert.equal(result.decision, 'done');
  assert.equal(result.source, 'explicit');
});
```

In `tests/task-done-heuristic.test.js`, add tests for fallback behavior:

```js
test('heuristic should return not_done for unfinished cues', () => {
  const result = decideTaskCompletion({
    completionState: 'completed',
    text: '下面继续剩余步骤',
  });
  assert.equal(result.decision, 'not_done');
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-done-decision.test.js tests/task-done-heuristic.test.js
```
Expected: FAIL with `Cannot find module '../modules/taskDoneSignals'`.

**Step 3: Commit**

```bash
git add tests/task-done-decision.test.js tests/task-done-heuristic.test.js
git commit -m "test: add failing tests for TASK_DONE signal and heuristic decisions"
```

### Task 2: Implement TASK_DONE signal and heuristic decision module

**Files:**
- Create: `modules/taskDoneSignals.js`
- Test: `tests/task-done-decision.test.js`
- Test: `tests/task-done-heuristic.test.js`

**Step 1: Write minimal implementation**

Implement:

```js
function detectExplicitTaskDone(text) { /* detect TASK_DONE or structured marker */ }
function evaluateHeuristicTaskDone({ completionState, text }) { /* done/not_done/uncertain */ }
function decideTaskCompletion({ completionState, text }) {
  // explicit first, heuristic fallback
}
module.exports = { detectExplicitTaskDone, evaluateHeuristicTaskDone, decideTaskCompletion };
```

Rules:
- explicit marker hit => `{ decision: 'done', source: 'explicit' }`
- no explicit marker => heuristic by positive/negative cues + completion state
- fallback output always one of `done|not_done|uncertain`

**Step 2: Run tests to verify it passes**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-done-decision.test.js tests/task-done-heuristic.test.js
```
Expected: PASS.

**Step 3: Commit**

```bash
git add modules/taskDoneSignals.js tests/task-done-decision.test.js tests/task-done-heuristic.test.js
git commit -m "feat: add TASK_DONE signal detection and heuristic decision module"
```

### Task 3: Add failing orchestrator state-machine tests

**Files:**
- Create: `tests/task-done-orchestrator.test.js`

**Step 1: Write the failing test**

Add tests for planned API:

```js
const { createTaskDoneOrchestrator } = require('../modules/taskDoneOrchestrator');

test('truncated should trigger auto continue when attempts remain', async () => {
  const calls = [];
  const orchestrator = createTaskDoneOrchestrator({
    maxAutoContinue: 3,
    triggerContinue: async () => calls.push('continue'),
  });
  await orchestrator.onStreamFinalized({
    messageId: 'm1',
    completionState: 'truncated',
    finalText: 'partial',
  });
  assert.deepEqual(calls, ['continue']);
});
```

Also cover:
- explicit done => no continue
- max attempts reached => halt
- user interrupted => halt
- mutex prevents duplicate concurrent continue

**Step 2: Run test to verify it fails**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-done-orchestrator.test.js
```
Expected: FAIL with `Cannot find module '../modules/taskDoneOrchestrator'`.

**Step 3: Commit**

```bash
git add tests/task-done-orchestrator.test.js
git commit -m "test: add failing state-machine tests for TASK_DONE orchestrator"
```

### Task 4: Implement renderer-side TaskDoneOrchestrator

**Files:**
- Create: `modules/taskDoneOrchestrator.js`
- Modify: `renderer.js`
- Test: `tests/task-done-orchestrator.test.js`

**Step 1: Write minimal implementation**

Create orchestrator with:
- per-message state store (`attemptCount`, `isAutoContinuing`, `errorCount`, `lastDecision`)
- `onStreamFinalized(payload)`
- decision path via `decideTaskCompletion`
- bounded auto-continue trigger for `truncated|unknown|not_done|uncertain`

`renderer.js` integration:
- call orchestrator after message finalization in `end/error` paths
- pass `completion_state`, final text, message context
- respect existing flowlock: do not conflict when flowlock active

**Step 2: Run tests to verify pass**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-done-orchestrator.test.js tests/task-done-decision.test.js tests/task-done-heuristic.test.js
```
Expected: PASS.

**Step 3: Commit**

```bash
git add modules/taskDoneOrchestrator.js modules/taskDoneSignals.js renderer.js tests/task-done-orchestrator.test.js tests/task-done-decision.test.js tests/task-done-heuristic.test.js
git commit -m "feat: add TASK_DONE auto-continue orchestrator in renderer"
```

### Task 5: Add continuation prompt contract and trigger wiring

**Files:**
- Modify: `modules/event-listeners.js`
- Modify: `renderer.js`
- Create: `modules/taskContinuePrompt.js`
- Test: `tests/task-continue-prompt.test.js`

**Step 1: Write failing tests for prompt contract**

Add tests to assert continuation prompt always includes:
- continue from interruption
- do not repeat completed parts
- list remaining unfinished items first
- output `TASK_DONE` when complete

**Step 2: Run tests to verify failure**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-continue-prompt.test.js
```
Expected: FAIL before module exists.

**Step 3: Implement minimal prompt builder and wiring**

Create `buildTaskContinuePrompt(baseUserIntent)` and use it where orchestrator triggers continue-write action.

**Step 4: Run tests to verify pass**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-continue-prompt.test.js tests/task-done-orchestrator.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add modules/taskContinuePrompt.js modules/event-listeners.js renderer.js tests/task-continue-prompt.test.js tests/task-done-orchestrator.test.js
git commit -m "feat: add TASK_DONE continuation prompt contract and trigger wiring"
```

### Task 6: Add resilience controls (retry, backoff, stop reasons) with tests

**Files:**
- Modify: `modules/taskDoneOrchestrator.js`
- Test: `tests/task-done-orchestrator.test.js`

**Step 1: Write failing tests for resilience**

Add cases:
- continue trigger fails twice then halts
- backoff sequence 1s/2s/4s (use injected scheduler/mock timer)
- stop reason is persisted (`max_attempts`, `max_errors`, `user_interrupt`, `task_done`)

**Step 2: Run tests to verify failure**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-done-orchestrator.test.js
```
Expected: FAIL on missing resilience behavior.

**Step 3: Implement minimal resilience logic**

Add:
- configurable `maxAutoContinue` default 3
- configurable `maxErrorRetries` default 2
- backoff helper
- structured halt reason

**Step 4: Run tests to verify pass**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-done-orchestrator.test.js
```
Expected: PASS.

**Step 5: Commit**

```bash
git add modules/taskDoneOrchestrator.js tests/task-done-orchestrator.test.js
git commit -m "fix: harden TASK_DONE orchestrator with retry and bounded backoff"
```

### Task 7: Integrate lightweight UX/status and final verification

**Files:**
- Modify: `renderer.js`
- Modify: `modules/ui-helpers.js`
- Modify: `docs/plans/2026-03-04-vcpchat-task-done-orchestration-design.md`

**Step 1: Write failing tests for status notifications (if testable)**

If UI-helper tests exist, add expectations for emitted status events/messages:
- auto continue start
- task done detected
- halted by max attempts/errors

If no existing UI test harness, add logging assertions in orchestrator tests using injected notifier mock.

**Step 2: Run tests to verify failure**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test tests/task-done-orchestrator.test.js
```
Expected: FAIL on missing notifier calls.

**Step 3: Implement minimal UX hooks**

- Add notifier callbacks in orchestrator and wire to existing toast helper.
- Keep messaging concise and non-blocking.

**Step 4: Run full targeted suite**

Run:
```bash
/home/xuzhen97/.config/nvm/versions/node/v22.22.0/bin/node --test \
  tests/request-timeout-policy.test.js \
  tests/stream-completion-mapper.test.js \
  tests/task-done-decision.test.js \
  tests/task-done-heuristic.test.js \
  tests/task-done-orchestrator.test.js \
  tests/task-continue-prompt.test.js
```
Expected: all PASS.

**Step 5: Commit**

```bash
git add renderer.js modules/ui-helpers.js modules/taskDoneOrchestrator.js docs/plans/2026-03-04-vcpchat-task-done-orchestration-design.md
git commit -m "feat: add TASK_DONE orchestration UX and verification coverage"
```
