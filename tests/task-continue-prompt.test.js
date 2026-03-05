const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTaskContinuePrompt } = require('../modules/taskContinuePrompt');

test('prompt should include core continuation constraints', () => {
  const prompt = buildTaskContinuePrompt('请继续当前任务');
  assert.equal(prompt.includes('从上次中断处继续'), true);
  assert.equal(prompt.includes('不要重复已完成内容'), true);
  assert.equal(prompt.includes('先列出剩余未完成项'), true);
  assert.equal(prompt.includes('TASK_DONE'), true);
});

test('prompt should work without base intent', () => {
  const prompt = buildTaskContinuePrompt('');
  assert.equal(prompt.includes('TASK_DONE'), true);
});
