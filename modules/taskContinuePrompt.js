const DEFAULT_TASK_CONTINUE_INSTRUCTIONS = [
    '从上次中断处继续。',
    '不要重复已完成内容。',
    '先列出剩余未完成项，再继续执行。',
    '全部完成后输出 TASK_DONE。'
].join(' ');

function buildTaskContinuePrompt(baseUserIntent = '') {
    const intent = typeof baseUserIntent === 'string' ? baseUserIntent.trim() : '';
    return intent ? `${intent}\n\n${DEFAULT_TASK_CONTINUE_INSTRUCTIONS}` : DEFAULT_TASK_CONTINUE_INSTRUCTIONS;
}

module.exports = {
    DEFAULT_TASK_CONTINUE_INSTRUCTIONS,
    buildTaskContinuePrompt
};
