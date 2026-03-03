# VCPChat Manual-Cancel No-Timeout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove automatic request timeout cancellation for single chat and group chat, so requests only stop on normal completion or explicit user interrupt.

**Architecture:** Keep existing `AbortController` request tracking and interrupt flows, but remove timer-driven `controller.abort()` calls in single-chat and group-chat request paths. Preserve current stream/error/end event contracts so renderer behavior remains compatible. Add a small regression test that enforces the no-auto-timeout policy for the targeted files.

**Tech Stack:** Electron, Node.js (CommonJS), fetch + AbortController, Node built-in test runner (`node --test`)

---

### Task 1: Add a failing policy test for no auto-timeout in chat paths

**Files:**
- Create: `tests/request-timeout-policy.test.js`
- Test: `tests/request-timeout-policy.test.js`

**Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const singleChatFile = path.join(root, 'modules', 'vcpClient.js');
const groupChatFile = path.join(root, 'Groupmodules', 'groupchat.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('single chat should not have timer-driven AbortController cancellation', () => {
  const code = read(singleChatFile);
  assert.equal(/setTimeout\s*\(\s*\(\)\s*=>\s*controller\.abort\(\)/.test(code), false);
});

test('group chat should not have 60s timer-driven AbortController cancellation', () => {
  const code = read(groupChatFile);
  assert.equal(/setTimeout\s*\(\s*\(\)\s*=>\s*controller\.abort\(\)\s*,\s*60000\s*\)/.test(code), false);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/request-timeout-policy.test.js`
Expected: FAIL because current files still include timer-based abort logic.

**Step 3: Commit**

```bash
git add tests/request-timeout-policy.test.js
git commit -m "test: add no-auto-timeout policy checks for chat paths"
```

### Task 2: Remove single-chat auto-timeout while preserving manual interrupt

**Files:**
- Modify: `modules/vcpClient.js`
- Test: `tests/request-timeout-policy.test.js`

**Step 1: Write minimal implementation**

```js
// Keep controller registration for manual interrupt support.
const controller = new AbortController();
activeRequests.set(messageId, controller);

// Remove timer-based auto abort; only manual interrupt should abort.
const response = await fetch(finalVcpUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${vcpApiKey}`
  },
  body: serializedBody,
  signal: controller.signal
});
```

Implementation notes:
- Delete the 30-second timeout creation block and related `clearTimeout(timeoutId)` calls.
- Keep `finally` cleanup of `activeRequests.delete(messageId)`.
- Keep existing `AbortError` handling and stream event behavior.

**Step 2: Run test to verify partial pass/progress**

Run: `node --test tests/request-timeout-policy.test.js`
Expected: single-chat test PASS; group-chat test may still FAIL until Task 3 is done.

**Step 3: Quick syntax check**

Run: `node --check modules/vcpClient.js`
Expected: no syntax errors.

**Step 4: Commit**

```bash
git add modules/vcpClient.js
git commit -m "fix: remove single-chat auto-timeout cancellation"
```

### Task 3: Remove group-chat auto-timeout in both normal and invite flows

**Files:**
- Modify: `Groupmodules/groupchat.js`
- Test: `tests/request-timeout-policy.test.js`

**Step 1: Write minimal implementation**

```js
// Keep per-request controller for manual stop behavior.
const controller = new AbortController();
activeRequestControllers.set(messageIdForAgentResponse, controller);

// Remove timer-driven 60s abort.
response = await fetch(globalVcpSettings.vcpUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${globalVcpSettings.vcpApiKey}`
  },
  body: JSON.stringify(payload),
  signal: controller.signal
});
```

Implementation notes:
- Remove both 60-second timeout blocks:
- Normal group reply path.
- Invite-agent-to-speak path.
- Remove now-unused timeout cleanup calls.
- Keep request controller map lifecycle and existing interrupt/event flows unchanged.

**Step 2: Run test to verify it passes**

Run: `node --test tests/request-timeout-policy.test.js`
Expected: PASS.

**Step 3: Quick syntax check**

Run: `node --check Groupmodules/groupchat.js`
Expected: no syntax errors.

**Step 4: Commit**

```bash
git add Groupmodules/groupchat.js
git commit -m "fix: remove group-chat auto-timeout cancellation"
```

### Task 4: Verify manual interrupt behavior with focused runtime checks

**Files:**
- Modify: none (verification only)
- Test: manual app-level validation using existing interrupt UI flow

**Step 1: Start app for manual verification**

Run: `npm start`
Expected: app opens normally.

**Step 2: Single-chat long stream verification**

Action:
- Start a long-running streaming prompt in single chat.
- Wait beyond 30 seconds.
Expected:
- Request continues streaming and is not auto-cancelled.

**Step 3: Single-chat manual interrupt verification**

Action:
- Click the existing stop/interrupt button while request is active.
Expected:
- Stream stops quickly.
- UI exits streaming state.

**Step 4: Group-chat long stream verification**

Action:
- Trigger long-running response in group chat (normal + invite path).
- Wait beyond 60 seconds.
Expected:
- Request continues and is not auto-cancelled.

**Step 5: Group-chat manual interrupt verification**

Action:
- Interrupt one active group response.
Expected:
- Target request stops.
- Other completed/non-target responses remain intact.

**Step 6: Commit verification notes**

```bash
git add -A
git commit -m "chore: document no-timeout manual verification results"
```

Use this commit only if you add explicit verification notes/log files. If no files changed, skip commit.

### Task 5: Update docs to record behavior change

**Files:**
- Modify: `README.md` (or nearest chat behavior section)

**Step 1: Add concise behavior note**

```md
- Single chat and group chat requests are no longer auto-time-limited by the client.
- Long-running requests continue until server completion or explicit user interrupt.
```

**Step 2: Run quick lint/sanity for docs formatting**

Run: `git diff -- README.md`
Expected: only intended doc lines changed.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: clarify manual-cancel no-timeout chat behavior"
```

## Final verification gate

Run all:
- `node --test tests/request-timeout-policy.test.js`
- `node --check modules/vcpClient.js`
- `node --check Groupmodules/groupchat.js`

Expected:
- Tests PASS
- No syntax errors
- Manual stop behavior confirmed in runtime checks

## References

- Design doc: `docs/plans/2026-03-03-vcpchat-manual-cancel-no-timeout-design.md`

