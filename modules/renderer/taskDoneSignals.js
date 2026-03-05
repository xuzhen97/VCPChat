const EXPLICIT_MARKERS = ['TASK_DONE', '"task_done": true', 'task_done:true'];
const POSITIVE_DONE_CUES = ['已完成', '全部完成', '任务完成', '执行完毕', '完成如下'];
const NEGATIVE_UNFINISHED_CUES = ['继续', '剩余', '未完成', '下一步', '后续'];

function normalizeText(input) {
    if (typeof input !== 'string') return '';
    return input.trim();
}

export function detectExplicitTaskDone(text) {
    const source = normalizeText(text);
    if (!source) return false;
    return EXPLICIT_MARKERS.some(marker => source.includes(marker));
}

export function evaluateHeuristicTaskDone({ completionState, text }) {
    const normalizedText = normalizeText(text);
    const hasPositiveDoneCue = POSITIVE_DONE_CUES.some(cue => normalizedText.includes(cue));
    const hasNegativeUnfinishedCue = NEGATIVE_UNFINISHED_CUES.some(cue => normalizedText.includes(cue));

    if (completionState === 'truncated') {
        return { decision: 'not_done', source: 'heuristic' };
    }

    if (completionState === 'unknown') {
        return { decision: 'uncertain', source: 'heuristic' };
    }

    if (hasNegativeUnfinishedCue && !hasPositiveDoneCue) {
        return { decision: 'not_done', source: 'heuristic' };
    }

    if (completionState === 'completed' && hasPositiveDoneCue && !hasNegativeUnfinishedCue) {
        return { decision: 'done', source: 'heuristic' };
    }

    if (completionState === 'completed') {
        return { decision: 'uncertain', source: 'heuristic' };
    }

    return { decision: 'not_done', source: 'heuristic' };
}

export function decideTaskCompletion({ completionState, text }) {
    if (detectExplicitTaskDone(text)) {
        return { decision: 'done', source: 'explicit' };
    }

    return evaluateHeuristicTaskDone({ completionState, text });
}
