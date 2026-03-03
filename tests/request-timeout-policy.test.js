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

test('interrupt request should be tagged with context-menu source in renderer', () => {
  const menuCode = read(path.join(root, 'modules', 'renderer', 'messageContextMenu.js'));
  const interruptHandlerCode = read(path.join(root, 'modules', 'interruptHandler.js'));
  assert.equal(menuCode.includes("source: 'context_menu_group'"), true);
  assert.equal(menuCode.includes("'context_menu_agent'"), true);
  assert.equal(interruptHandlerCode.includes('interruptVcpRequest({ messageId, source })'), true);
});

test('main process should reject interrupt requests without approved source', () => {
  const singleInterruptCode = read(path.join(root, 'modules', 'ipc', 'chatHandlers.js'));
  const groupInterruptCode = read(path.join(root, 'main.js'));
  assert.equal(singleInterruptCode.includes('context_menu_agent'), true);
  assert.equal(singleInterruptCode.includes('source not allowed'), true);
  assert.equal(groupInterruptCode.includes('context_menu_group'), true);
  assert.equal(groupInterruptCode.includes('source not allowed'), true);
});
