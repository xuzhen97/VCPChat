const test = require('node:test');
const assert = require('node:assert/strict');

const { mapStreamCompletion } = require('../modules/streamCompletionMapper');

test('done token with stop is completed', () => {
  assert.deepEqual(
    mapStreamCompletion({ endSource: 'done_token', finishReason: 'stop', interrupted: false, hasError: false, hasContent: true }),
    { completionState: 'completed', finishReason: 'stop', endSource: 'done_token', hasContent: true }
  );
});

test('done token with length is truncated', () => {
  const result = mapStreamCompletion({ endSource: 'done_token', finishReason: 'length', interrupted: false, hasError: false, hasContent: true });
  assert.equal(result.completionState, 'truncated');
  assert.equal(result.finishReason, 'length');
});

test('abort is interrupted', () => {
  const result = mapStreamCompletion({ endSource: 'abort', interrupted: true, hasError: false, hasContent: false });
  assert.equal(result.completionState, 'interrupted');
  assert.equal(result.endSource, 'abort');
});

test('stream closed without reason is unknown', () => {
  const result = mapStreamCompletion({ endSource: 'stream_closed', interrupted: false, hasError: false, hasContent: true });
  assert.equal(result.completionState, 'unknown');
});

test('stream error is error', () => {
  const result = mapStreamCompletion({ endSource: 'stream_error', interrupted: false, hasError: true, hasContent: false });
  assert.equal(result.completionState, 'error');
});
