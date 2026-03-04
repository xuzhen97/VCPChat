function normalizeFinishReason(raw) {
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim().toLowerCase();
    return normalized || null;
}

function mapStreamCompletion(input = {}) {
    const endSource = typeof input.endSource === 'string' ? input.endSource : 'stream_closed';
    const finishReason = normalizeFinishReason(input.finishReason);
    const hasContent = input.hasContent === true;

    if (input.interrupted === true || endSource === 'abort') {
        return {
            completionState: 'interrupted',
            finishReason,
            endSource: 'abort',
            hasContent
        };
    }

    if (input.hasError === true || endSource === 'http_error' || endSource === 'stream_error') {
        return {
            completionState: 'error',
            finishReason,
            endSource,
            hasContent
        };
    }

    if (endSource === 'done_token') {
        if (finishReason === 'stop') {
            return {
                completionState: 'completed',
                finishReason,
                endSource,
                hasContent
            };
        }

        if (finishReason) {
            return {
                completionState: 'truncated',
                finishReason,
                endSource,
                hasContent
            };
        }
    }

    return {
        completionState: 'unknown',
        finishReason,
        endSource,
        hasContent
    };
}

module.exports = {
    normalizeFinishReason,
    mapStreamCompletion
};
