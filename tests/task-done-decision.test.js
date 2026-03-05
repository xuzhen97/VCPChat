const test = require('node:test');
const assert = require('node:assert/strict');

const { detectExplicitTaskDone, decideTaskCompletion } = require('../modules/taskDoneSignals');

test('detectExplicitTaskDone should detect TASK_DONE token', () => {
  assert.equal(detectExplicitTaskDone('任务已完成 TASK_DONE'), true);
});

test('decideTaskCompletion should return done when explicit marker exists', () => {
  const result = decideTaskCompletion({
    completionState: 'truncated',
    text: '...TASK_DONE...'
  });
  assert.equal(result.decision, 'done');
  assert.equal(result.source, 'explicit');
});

test('decideTaskCompletion should continue when truncated and no marker', () => {
  const result = decideTaskCompletion({
    completionState: 'truncated',
    text: '先做了前两步，后续继续'
  });
  assert.equal(result.decision, 'not_done');
});
