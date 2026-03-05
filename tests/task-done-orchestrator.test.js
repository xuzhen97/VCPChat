const test = require('node:test');
const assert = require('node:assert/strict');

const { createTaskDoneOrchestrator } = require('../modules/taskDoneOrchestrator');

test('truncated should trigger auto continue when attempts remain', async () => {
  const calls = [];
  const orchestrator = createTaskDoneOrchestrator({
    maxAutoContinue: 3,
    triggerContinue: async () => {
      calls.push('continue');
    }
  });

  await orchestrator.onStreamFinalized({
    messageId: 'm1',
    completionState: 'truncated',
    finalText: 'partial output'
  });

  assert.deepEqual(calls, ['continue']);
});

test('explicit TASK_DONE should not trigger auto continue', async () => {
  const calls = [];
  const orchestrator = createTaskDoneOrchestrator({
    maxAutoContinue: 3,
    triggerContinue: async () => {
      calls.push('continue');
    }
  });

  const result = await orchestrator.onStreamFinalized({
    messageId: 'm2',
    completionState: 'completed',
    finalText: 'All done TASK_DONE'
  });

  assert.equal(result.decision, 'done');
  assert.deepEqual(calls, []);
});

test('should halt when max attempts reached', async () => {
  const calls = [];
  const orchestrator = createTaskDoneOrchestrator({
    maxAutoContinue: 1,
    triggerContinue: async () => {
      calls.push('continue');
    }
  });

  await orchestrator.onStreamFinalized({ messageId: 'm3', completionState: 'truncated', finalText: 'part1' });
  const result = await orchestrator.onStreamFinalized({ messageId: 'm3', completionState: 'truncated', finalText: 'part2' });

  assert.equal(result.halted, true);
  assert.equal(result.reason, 'max_attempts');
  assert.equal(calls.length, 1);
});
