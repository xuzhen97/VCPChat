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
