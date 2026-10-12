const { parse, startOfDay, addDays, mondayOf } = window.YanXuQuickParser;
const { WORKSPACE_MODES, normalizeWorkspaceMode } = window.YanXuWorkspaceModes;

let data = null;
let saveTimer = null;
let toastTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const pad = (value) => String(value).padStart(2, '0');
const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sameDay(left, right) { return dateKey(left) === dateKey(right); }
function endOfDay(value) { return addDays(startOfDay(value), 1); }
function inInterval(value, start, end) { const time = new Date(value).getTime(); return time >= start.getTime() && time < end.getTime(); }
function formatTime(value) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
function formatShortDate(value) { return `${new Date(value).getMonth() + 1} 月 ${new Date(value).getDate()} 日`; }
function weekday(value) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(value).getDay()]; }

function normalizedSettings() {
  data.settings = {
    theme: 'system', defaultCalendarView: 'week', workspaceMode: 'research',
    desktopWidgetEnabled: true, desktopWidgetLocked: false, desktopWidgetAppearance: 'dark', desktopWidgetBounds: null,
    ...(data.settings || {})
  };
  data.settings.workspaceMode = normalizeWorkspaceMode(data.settings.workspaceMode);
  data.settings.desktopWidgetAppearance = data.settings.desktopWidgetAppearance === 'light' ? 'light' : 'dark';
  return data.settings;
}

function currentMode() { return WORKSPACE_MODES[normalizedSettings().workspaceMode] || WORKSPACE_MODES.research; }

function occurs(task, value) {
  if (task.scheduleKind === 'inbox' || !task.start) return false;
  const day = startOfDay(value);
  const first = startOfDay(task.start);
  if (day < first) return false;
  if (task.scheduleKind === 'range') return day <= startOfDay(task.end || task.start);
  if (task.repeatRule === 'daily') return true;
  if (task.repeatRule === 'weekly') return day.getDay() === first.getDay();
  if (task.repeatRule === 'monthly') return day.getDate() === first.getDate();
  return sameDay(day, first);
}

function taskComplete(task, occurrenceDate) {
  if (task.repeatRule && task.repeatRule !== 'none') return (task.completedOccurrenceKeys || []).includes(dateKey(occurrenceDate));
  return Boolean(task.completedAt);
}

function occurrenceSort(left, right) {
  const rank = (task) => task.scheduleKind === 'fixed' ? new Date(task.start).getHours() * 60 + new Date(task.start).getMinutes() : 1440;
  return Number(taskComplete(left, left.start)) - Number(taskComplete(right, right.start)) || rank(left) - rank(right) || new Date(left.createdAt) - new Date(right.createdAt);
}

function tasksOn(value) {
  return data.tasks.filter((task) => occurs(task, value)).sort((left, right) => {
    const completionOrder = Number(taskComplete(left, value)) - Number(taskComplete(right, value));
    return completionOrder || occurrenceSort(left, right);
  });
}

function overlapDuration(session, start, end, current = new Date()) {
  const sessionStart = Math.max(new Date(session.arrivedAt).getTime(), start.getTime());
  const sessionEnd = Math.min(new Date(session.leftAt || current).getTime(), end.getTime());
  return Math.max(0, sessionEnd - sessionStart);
}

function durationText(milliseconds) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
}

function todayDuration() {
  const start = startOfDay(new Date());
  const end = endOfDay(start);
  return data.attendanceSessions.reduce((total, session) => total + overlapDuration(session, start, end), 0);
}

function taskTint(task) {
  if (task.scheduleKind === 'fixed') return 'var(--accent)';
  if (task.scheduleKind === 'range') return 'var(--success)';
  return 'var(--day-task)';
}

function taskMarkup(task, day) {
  const completed = taskComplete(task, day);
  return `<button class="widget-task ${completed ? 'completed' : ''}" data-task-id="${task.id}" data-task-date="${dateKey(day)}" style="--task-color:${taskTint(task)}">
    <i class="task-check">${completed ? '✓' : ''}</i>
    <span><strong>${escapeHTML(task.title)}</strong>${task.scheduleKind === 'fixed' ? `<small>${formatTime(task.start)}</small>` : ''}</span>
  </button>`;
}

function render() {
  if (!data) return;
  const settings = normalizedSettings();
  const mode = currentMode();
  const now = new Date();
  const weekStart = mondayOf(now);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const todayTasks = tasksOn(now);
  const completed = todayTasks.filter((task) => taskComplete(task, now)).length;

  document.documentElement.dataset.mode = settings.workspaceMode;
  document.documentElement.dataset.appearance = settings.desktopWidgetAppearance;
  document.documentElement.dataset.locked = String(settings.desktopWidgetLocked);
  $('#week-range').textContent = `${formatShortDate(weekStart)} — ${formatShortDate(days[6])}`;
  $('#today-duration-label').textContent = mode.today;
  $('#today-duration').textContent = durationText(todayDuration());
  $('#task-progress').textContent = `${completed}/${todayTasks.length}`;
  $('#quick-input').placeholder = `新增任务，如：${mode.quickPlaceholder.replace(/^试试：/, '')}`;
  $('#appearance-toggle').textContent = settings.desktopWidgetAppearance === 'dark' ? '☀' : '☾';
  $('#appearance-toggle').title = settings.desktopWidgetAppearance === 'dark' ? '切换到白天模式' : '切换到黑夜模式';
  $('#lock-toggle').classList.toggle('active', settings.desktopWidgetLocked);
  $('#lock-toggle').textContent = settings.desktopWidgetLocked ? '●' : '⌖';
  $('#lock-toggle').title = settings.desktopWidgetLocked ? '解除位置锁定' : '锁定卡片位置';

  $('#week-grid').innerHTML = days.map((day) => {
    const tasks = tasksOn(day);
    const visibleTasks = tasks.slice(0, 8);
    return `<article class="widget-day ${sameDay(day, now) ? 'today' : ''}">
      <button class="day-heading" data-open-main title="在研序中打开"><small>${weekday(day)}</small><b>${day.getDate()}</b></button>
      <div class="day-tasks">
        ${visibleTasks.length ? visibleTasks.map((task) => taskMarkup(task, day)).join('') : '<div class="empty-day">暂无计划</div>'}
        ${tasks.length > 8 ? `<div class="more-tasks">还有 ${tasks.length - 8} 项</div>` : ''}
      </div>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-open-main]').forEach((button) => button.addEventListener('click', () => window.yanxu.widgetAction('open-main')));
  document.querySelectorAll('[data-task-id]').forEach((button) => button.addEventListener('click', () => toggleTask(button.dataset.taskId, button.dataset.taskDate)));
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.yanxu.saveState(data), 60);
}

function showToast(message) {
  const toast = $('#widget-toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function toggleTask(id, dateValue) {
  const task = data.tasks.find((item) => item.id === id);
  if (!task) return;
  if (task.repeatRule && task.repeatRule !== 'none') {
    task.completedOccurrenceKeys ||= [];
    const key = dateKey(dateValue);
    const index = task.completedOccurrenceKeys.indexOf(key);
    if (index >= 0) task.completedOccurrenceKeys.splice(index, 1); else task.completedOccurrenceKeys.push(key);
  } else task.completedAt = task.completedAt ? null : nowISO();
  render();
  save();
}

function addQuickTask(rawInput) {
  const input = rawInput.trim();
  if (!input) return;
  const result = parse(input, new Date());
  data.tasks.push({
    id: uid(), title: result.title, notes: '', scheduleKind: result.scheduleKind,
    start: result.start, end: null, repeatRule: 'none', completedAt: null,
    completedOccurrenceKeys: [], createdAt: nowISO()
  });
  $('#quick-input').value = '';
  render();
  save();
  showToast(result.scheduleKind === 'inbox' ? '已加入待安排' : '任务已添加');
}

$('#open-main').addEventListener('click', () => window.yanxu.widgetAction('open-main'));
$('#widget-close').addEventListener('click', () => window.yanxu.widgetAction('close'));
$('#quick-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addQuickTask(event.currentTarget.value);
});
$('#appearance-toggle').addEventListener('click', () => {
  data.settings.desktopWidgetAppearance = normalizedSettings().desktopWidgetAppearance === 'dark' ? 'light' : 'dark';
  render();
  save();
});
$('#lock-toggle').addEventListener('click', async () => {
  const result = await window.yanxu.setDesktopWidgetLocked(!normalizedSettings().desktopWidgetLocked);
  data.settings.desktopWidgetLocked = result.locked;
  render();
  showToast(result.locked ? '卡片位置已锁定' : '现在可以拖动卡片');
});

window.yanxu.onStateChanged((next) => { data = next; render(); });

async function init() {
  data = await window.yanxu.loadState();
  render();
  setInterval(render, 60000);
}

init();
