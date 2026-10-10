(function exposeWorkspaceModes(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YanXuWorkspaceModes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const WORKSPACE_MODES = Object.freeze({
    research: Object.freeze({
      label: '科研模式', short: '科研', icon: 'flask',
      description: '论文、实验与学术计划',
      quickPlaceholder: '试试：明天下午 2 点开组会',
      weekDuration: '本周科研时长', duration: '科研时长', session: '科研时段',
      attendance: '科研打卡', today: '今日科研', active: '正在科研',
      idleHint: '可以继续开始新的科研时段', recordsSubtitle: '回顾科研投入、任务进度和习惯坚持'
    }),
    work: Object.freeze({
      label: '工作模式', short: '工作', icon: 'briefcase',
      description: '项目、会议与专注时间',
      quickPlaceholder: '试试：明天下午 2 点项目会议',
      weekDuration: '本周工作时长', duration: '工作时长', session: '工作时段',
      attendance: '工作打卡', today: '今日工作', active: '正在工作',
      idleHint: '可以开始新的专注工作时段', recordsSubtitle: '回顾工作投入、任务进度和习惯坚持'
    }),
    study: Object.freeze({
      label: '学习模式', short: '学习', icon: 'book',
      description: '课程、复习与学习节奏',
      quickPlaceholder: '试试：今晚 8 点复习第三章',
      weekDuration: '本周学习时长', duration: '学习时长', session: '学习时段',
      attendance: '学习打卡', today: '今日学习', active: '正在学习',
      idleHint: '可以开始新的学习时段', recordsSubtitle: '回顾学习投入、任务进度和习惯坚持'
    })
  });

  const WORKSPACE_MODE_KEYS = Object.freeze(Object.keys(WORKSPACE_MODES));
  const normalizeWorkspaceMode = (value) => WORKSPACE_MODE_KEYS.includes(value) ? value : 'research';

  return { WORKSPACE_MODES, WORKSPACE_MODE_KEYS, normalizeWorkspaceMode };
});
