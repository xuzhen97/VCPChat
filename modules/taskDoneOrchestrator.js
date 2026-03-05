const { decideTaskCompletion } = require('./taskDoneSignals');
const { buildTaskContinuePrompt } = require('./taskContinuePrompt');

function createTaskDoneOrchestrator(options = {}) {
    const maxAutoContinue = Number.isInteger(options.maxAutoContinue) ? options.maxAutoContinue : 3;
    const maxErrorRetries = Number.isInteger(options.maxErrorRetries) ? options.maxErrorRetries : 2;
    const triggerContinue = typeof options.triggerContinue === 'function' ? options.triggerContinue : async () => {};
    const buildPrompt = typeof options.buildPrompt === 'function' ? options.buildPrompt : buildTaskContinuePrompt;

    const states = new Map();

    function getState(messageId) {
        if (!states.has(messageId)) {
            states.set(messageId, {
                attemptCount: 0,
                errorCount: 0,
                isAutoContinuing: false,
                lastDecision: null,
                halted: false,
                reason: null
            });
        }
        return states.get(messageId);
    }

    async function onStreamFinalized(payload = {}) {
        const messageId = payload.messageId;
        if (!messageId) {
            return { halted: true, reason: 'invalid_message_id' };
        }

        const state = getState(messageId);
        const completionState = payload.completionState || 'unknown';
        const finalText = typeof payload.finalText === 'string' ? payload.finalText : '';

        if (payload.interrupted === true) {
            state.halted = true;
            state.reason = 'user_interrupt';
            state.lastDecision = 'halted';
            return { decision: 'halted', halted: true, reason: 'user_interrupt' };
        }

        const decision = decideTaskCompletion({ completionState, text: finalText });
        state.lastDecision = decision.decision;

        const mustContinueByCompletionState = completionState === 'truncated' || completionState === 'unknown';
        const mustContinueByDecision = decision.decision === 'not_done' || decision.decision === 'uncertain';

        if (!mustContinueByCompletionState && !mustContinueByDecision) {
            state.halted = true;
            state.reason = 'task_done';
            return { decision: decision.decision, source: decision.source, halted: false };
        }

        if (state.isAutoContinuing) {
            return { decision: 'continue_pending', halted: false, reason: 'already_processing' };
        }

        if (state.attemptCount >= maxAutoContinue) {
            state.halted = true;
            state.reason = 'max_attempts';
            return { decision: 'halted', halted: true, reason: 'max_attempts' };
        }

        state.isAutoContinuing = true;
        state.attemptCount += 1;

        try {
            await triggerContinue({
                messageId,
                attempt: state.attemptCount,
                prompt: buildPrompt(payload.basePrompt || '')
            });
            state.errorCount = 0;
            return { decision: 'continue', halted: false, attempt: state.attemptCount };
        } catch (error) {
            state.errorCount += 1;
            if (state.errorCount >= maxErrorRetries) {
                state.halted = true;
                state.reason = 'max_errors';
                return { decision: 'halted', halted: true, reason: 'max_errors', error: error.message };
            }
            return { decision: 'continue_failed', halted: false, reason: 'retryable_error', error: error.message };
        } finally {
            state.isAutoContinuing = false;
        }
    }

    return {
        onStreamFinalized,
        _getState: getState
    };
}

module.exports = {
    createTaskDoneOrchestrator
};
