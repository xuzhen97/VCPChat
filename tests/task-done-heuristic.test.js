const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateHeuristicTaskDone } = require('../modules/taskDoneSignals');

test('heuristic should return done for completed with done cues', () => {
  const result = evaluateHeuristicTaskDone({
    completionState: 'completed',
    text: '所有步骤已完成，任务结束。'
  });
  assert.equal(result.decision, 'done');
});

test('heuristic should return not_done for unfinished cues', () => {
  const result = evaluateHeuristicTaskDone({
    completionState: 'completed',
    text: '下面继续剩余步骤。'
  });
  assert.equal(result.decision, 'not_done');
});

test('heuristic should return uncertain for unknown completion state', () => {
  const result = evaluateHeuristicTaskDone({
    completionState: 'unknown',
    text: '这里是中间结果。'
  });
  assert.equal(result.decision, 'uncertain');
});
