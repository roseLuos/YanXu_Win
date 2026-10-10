const { parse, startOfDay, addDays, mondayOf, DAY_MS } = window.YanXuQuickParser;
const { WORKSPACE_MODES, normalizeWorkspaceMode } = window.YanXuWorkspaceModes;

let data = null;
let calendarAnchor = startOfDay(new Date());
let calendarView = 'week';
let saveTimer = null;
let toastTimer = null;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const recordsState = {
  section: 'dashboard',
  period: 'week',
  selectedDate: startOfDay(new Date()),
  monthGranularity: 'day'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const pad = (value) => String(value).padStart(2, '0');
const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function iconSVG(name, className = '') {
  const icons = {
    building: '<path d="M4 21V4.8C4 3.8 4.8 3 5.8 3h8.4c1 0 1.8.8 1.8 1.8V21M2 21h20M8 7h2m2 0h1M8 11h2m2 0h1M8 15h2m2 0h1m5-6h1.2c1 0 1.8.8 1.8 1.8V21m-3-8h1m-1 4h1"/>',
    location: '<path class="filled" d="M12 2.5a7 7 0 0 0-7 7c0 5.25 7 12 7 12s7-6.75 7-12a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/>',
    flask: '<path d="M9 3h6M10 3v5.2l-5.2 8.7A2.7 2.7 0 0 0 7.1 21h9.8a2.7 2.7 0 0 0 2.3-4.1L14 8.2V3M7.2 15h9.6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5.5C8 4.7 8.7 4 9.5 4h5c.8 0 1.5.7 1.5 1.5V7M3 12h18M10 12v2h4v-2"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v17H6.5A2.5 2.5 0 0 0 4 21.5v-17ZM20 4.5A2.5 2.5 0 0 0 17.5 2H13v17h4.5a2.5 2.5 0 0 1 2.5 2.5v-17Z"/>',
    check: '<path d="m5 12 4.2 4.2L19 6.5"/>',
    repeat: '<path d="M17 2.8 21 7l-4 4.2M3 7h18M7 21.2 3 17l4-4.2M21 17H3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'
  };
  return `<svg class="app-icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.building}</svg>`;
}

function dateKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sameDay(left, right) { return dateKey(left) === dateKey(right); }
function endOfDay(value) { const date = startOfDay(value); date.setDate(date.getDate() + 1); return date; }
function weekEnd(value) { return addDays(mondayOf(value), 7); }
function monthStart(value) { const date = new Date(value); return new Date(date.getFullYear(), date.getMonth(), 1); }
function monthEnd(value) { const date = monthStart(value); date.setMonth(date.getMonth() + 1); return date; }
function inInterval(value, start, end) { const time = new Date(value).getTime(); return time >= start.getTime() && time < end.getTime(); }

function formatFullDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(value);
}
function formatShortDate(value) { return `${new Date(value).getMonth() + 1} 月 ${new Date(value).getDate()} 日`; }
function formatTime(value) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
function weekday(value) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(value).getDay()]; }
function durationText(milliseconds) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
}
function compactDuration(milliseconds) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
function daysFromToday(value) {
  return Math.round((startOfDay(value) - startOfDay(new Date())) / DAY_MS);
}
function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function dateTimeInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return `${dateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fromLocalInput(value) {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).toISOString();
  return new Date(value).toISOString();
}

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

function taskDueDate(task) { return task.scheduleKind === 'range' ? (task.end || task.start) : task.start; }

function occurrenceSort(left, right) {
  const rank = (task) => task.scheduleKind === 'fixed' ? new Date(task.start).getHours() * 60 + new Date(task.start).getMinutes() : 0;
  return rank(left) - rank(right) || new Date(left.createdAt) - new Date(right.createdAt);
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

function intervalAttendance(start, end, current = new Date()) {
  return data.attendanceSessions.reduce((sum, item) => sum + overlapDuration(item, start, end, current), 0);
}

function weekHabitCount(habitId, reference = new Date()) {
  const start = mondayOf(reference);
  const end = addDays(start, 7);
  return data.habitLogs.filter((item) => item.habitID === habitId && inInterval(item.timestamp, start, end)).length;
}

function plannedInInterval(start, end) {
  let total = 0;
  for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) total += tasksOn(cursor).length;
  return total;
}

function completedInInterval(start, end) {
  let total = 0;
  for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) {
    total += tasksOn(cursor).filter((task) => taskComplete(task, cursor)).length;
  }
  return total;
}

function overdueOccurrences() {
  const today = startOfDay(new Date());
  const ignored = new Set(data.ignoredOverdueOccurrenceKeys || []);
  const result = [];
  for (const task of data.tasks) {
    if (task.scheduleKind === 'inbox' || !task.start) continue;
    if (task.repeatRule && task.repeatRule !== 'none') {
      let cursor = new Date(Math.max(startOfDay(task.start).getTime(), addDays(today, -60).getTime()));
      while (cursor < today) {
        const key = `${task.id}-${dateKey(cursor)}`;
        if (occurs(task, cursor) && !taskComplete(task, cursor) && !ignored.has(key)) result.push({ task, date: new Date(cursor), key });
        cursor = addDays(cursor, 1);
      }
    } else {
      const due = taskDueDate(task);
      const key = `${task.id}-${dateKey(due)}`;
      if (due && startOfDay(due) < today && !taskComplete(task, due) && !ignored.has(key)) result.push({ task, date: startOfDay(due), key });
    }
  }
  return result.sort((a, b) => a.date - b.date);
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.yanxu.saveState(data).catch(() => showToast('数据保存失败')), 90);
}

function saveAndRender() { save(); renderAll(); }

function normalizedSettings() {
  data.settings = {
    theme: 'system',
    defaultCalendarView: 'week',
    workspaceMode: 'research',
    ...(data.settings || {})
  };
  data.settings.workspaceMode = normalizeWorkspaceMode(data.settings.workspaceMode);
  return data.settings;
}

function currentMode() {
  return WORKSPACE_MODES[normalizedSettings().workspaceMode] || WORKSPACE_MODES.research;
}

function applyTheme() {
  if (!data) return;
  const preference = normalizedSettings().theme;
  document.documentElement.dataset.theme = preference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preference;
}

function applyWorkspaceMode() {
  if (!data) return;
  const settings = normalizedSettings();
  const mode = currentMode();
  document.documentElement.dataset.mode = settings.workspaceMode;
  document.title = `研序 · ${mode.label}`;
  $('#brand-mode').textContent = mode.label;
  $('#quick-input').placeholder = mode.quickPlaceholder;
}

function showToast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2300);
}

function renderDashboard() {
  const mode = currentMode();
  const start = mondayOf(new Date());
  const end = addDays(start, 7);
  const focusMs = intervalAttendance(start, end);
  const sessions = data.attendanceSessions.filter((item) => overlapDuration(item, start, end) > 0);
  const starts = sessions.map((item) => new Date(item.arrivedAt)).filter((value) => inInterval(value, start, end));
  const ends = sessions.filter((item) => item.leftAt).map((item) => new Date(item.leftAt)).filter((value) => inInterval(value, start, end));
  const earliest = starts.sort((a, b) => (a.getHours() * 60 + a.getMinutes()) - (b.getHours() * 60 + b.getMinutes()))[0];
  const latest = ends.sort((a, b) => (b.getHours() * 60 + b.getMinutes()) - (a.getHours() * 60 + a.getMinutes()))[0];
  const longest = sessions.map((item) => overlapDuration(item, start, end)).sort((a, b) => b - a)[0] || 0;
  const planned = plannedInInterval(start, end);
  const completed = completedInInterval(start, end);
  const percent = planned ? Math.round(completed / planned * 100) : 0;
  $('#dashboard').innerHTML = `
    <article class="dashboard-card blue">
      <div class="eyebrow"><span class="dot">◷</span>${mode.weekDuration}</div>
      <div class="metric-main">${durationText(focusMs)}</div>
      <div class="metric-row">
        <div class="micro-metric"><span>最早开始</span><b>${earliest ? formatTime(earliest) : '—'}</b></div>
        <div class="micro-metric"><span>最晚结束</span><b>${latest ? formatTime(latest) : '—'}</b></div>
        <div class="micro-metric"><span>最长单次</span><b>${longest ? compactDuration(longest) : '—'}</b></div>
      </div>
    </article>
    <article class="dashboard-card orange">
      <div class="eyebrow"><span class="dot">✓</span>完成任务情况</div>
      <div class="metric-main">${completed}<small>/ ${planned} 项</small></div>
      <div class="progress"><i style="width:${Math.min(100, percent)}%"></i></div>
      <div class="metric-sub">本周完成率 ${percent}%</div>
    </article>
    <article class="dashboard-card green">
      <div class="eyebrow"><span class="dot">↔</span>习惯打卡情况</div>
      ${data.habits.length ? data.habits.slice(0, 3).map((habit) => {
        const count = weekHabitCount(habit.id);
        return `<div class="habit-mini"><b>${escapeHTML(habit.name)}</b><div class="progress"><i style="width:${Math.min(100, count / habit.weeklyTarget * 100)}%;background:var(--green)"></i></div><em>${count}/${habit.weeklyTarget}</em></div>`;
      }).join('') : '<div class="metric-sub">还没有习惯目标，可在右侧添加</div>'}
    </article>`;
}

function taskMeta(task, date) {
  if (task.scheduleKind === 'fixed') return `◷ ${formatTime(new Date(new Date(date).setHours(new Date(task.start).getHours(), new Date(task.start).getMinutes())))}`;
  if (task.scheduleKind === 'range') return `${formatShortDate(task.start)}–${formatShortDate(task.end || task.start)}`;
  if (task.scheduleKind === 'inbox') return '等待安排日期';
  return `▦ ${formatShortDate(date)}`;
}

function taskRow(task, occurrenceDate, extraClass = '') {
  const complete = taskComplete(task, occurrenceDate);
  return `<div class="task-row ${extraClass} ${complete ? 'completed' : ''}" data-task-row="${task.id}">
    <button class="task-check ${complete ? 'checked' : ''}" data-action="toggle-task" data-id="${task.id}" data-date="${dateKey(occurrenceDate)}">${complete ? '✓' : ''}</button>
    <div class="task-name">${escapeHTML(task.title)}</div>
    <div class="task-meta">${taskMeta(task, occurrenceDate)}</div>
    <button class="task-menu" data-action="edit-task" data-id="${task.id}">•••</button>
  </div>`;
}

function taskGroup(title, entries, className = '') {
  if (!entries.length) return '';
  return `<section class="task-group ${className}"><div class="task-group-title"><span>${title}</span><em>${entries.length}</em></div>${entries.join('')}</section>`;
}

function renderToday() {
  const today = startOfDay(new Date());
  const todayTasks = tasksOn(today);
  const completed = todayTasks.filter((task) => taskComplete(task, today));
  const active = todayTasks.filter((task) => !taskComplete(task, today));
  const overdue = overdueOccurrences();
  const inbox = data.tasks.filter((task) => task.scheduleKind === 'inbox' && !task.completedAt).sort(occurrenceSort);
  $('#today-date').textContent = formatFullDate(today);
  $('#today-progress').textContent = `${completed.length} / ${todayTasks.length} 已完成`;
  $('#today-list').innerHTML = [
    taskGroup('已逾期', overdue.map(({ task, date }) => taskRow(task, date, 'overdue')), 'overdue'),
    taskGroup('今天', active.map((task) => taskRow(task, today))),
    taskGroup('未安排', inbox.map((task) => taskRow(task, today)), 'inbox'),
    taskGroup('已完成', completed.map((task) => taskRow(task, today)), 'completed-group')
  ].join('') || '<div class="empty-block">今天还没有安排<br>在上方快速添加一个任务吧</div>';
}

function calendarTask(task, date) {
  const complete = taskComplete(task, date);
  return `<div class="calendar-task ${task.scheduleKind} ${complete ? 'completed' : ''}" draggable="true" data-drag-task="${task.id}" data-action="edit-task" data-id="${task.id}">
    <button class="task-check ${complete ? 'checked' : ''}" data-action="toggle-task" data-id="${task.id}" data-date="${dateKey(date)}">${complete ? '✓' : ''}</button>
    <strong>${escapeHTML(task.title)}</strong>${task.scheduleKind === 'fixed' ? `<small>${formatTime(task.start)}</small>` : task.scheduleKind === 'range' ? '<small>日期范围</small>' : ''}
  </div>`;
}

function renderWeekCalendar() {
  const start = mondayOf(calendarAnchor);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  $('#calendar-title').textContent = `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()} 日 – ${days[6].getMonth() + 1} 月 ${days[6].getDate()} 日`;
  $('#calendar-body').innerHTML = `<div class="week-grid">${days.map((day) => `
    <section class="day-column ${sameDay(day, new Date()) ? 'today' : ''}">
      <div class="day-head"><span>${weekday(day)}</span><b>${day.getDate()}</b></div>
      <div class="day-tasks" data-drop-date="${dateKey(day)}">
        ${tasksOn(day).map((task) => calendarTask(task, day)).join('')}
        <button class="day-add" data-action="new-on-date" data-date="${dateKey(day)}">＋ 添加</button>
      </div>
    </section>`).join('')}</div>`;
  bindCalendarDrag();
}

function renderMonthCalendar() {
  const first = monthStart(calendarAnchor);
  const gridStart = mondayOf(first);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  $('#calendar-title').textContent = `${first.getFullYear()} 年 ${first.getMonth() + 1} 月`;
  $('#calendar-body').innerHTML = `<div class="month-grid">
    ${['周一','周二','周三','周四','周五','周六','周日'].map((day) => `<div class="month-weekday">${day}</div>`).join('')}
    ${days.map((day) => {
      const entries = tasksOn(day);
      return `<div class="month-day ${day.getMonth() !== first.getMonth() ? 'other' : ''} ${sameDay(day, new Date()) ? 'today' : ''}" data-drop-date="${dateKey(day)}" data-action="new-on-date" data-date="${dateKey(day)}">
        <div class="month-number">${day.getDate()}</div>
        ${entries.slice(0, 3).map((task) => `<div class="month-task" draggable="true" data-drag-task="${task.id}" data-action="edit-task" data-id="${task.id}">${escapeHTML(task.title)}</div>`).join('')}
        ${entries.length > 3 ? `<div class="month-task">还有 ${entries.length - 3} 项</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
  bindCalendarDrag();
}

function renderCalendar() {
  $$('.segmented button').forEach((button) => button.classList.toggle('active', button.dataset.view === calendarView));
  if (calendarView === 'week') renderWeekCalendar(); else renderMonthCalendar();
}

function bindCalendarDrag() {
  $$('[data-drag-task]').forEach((element) => element.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', element.dataset.dragTask);
    event.dataTransfer.effectAllowed = 'move';
  }));
  $$('[data-drop-date]').forEach((element) => {
    element.addEventListener('dragover', (event) => { event.preventDefault(); element.classList.add('drag-over'); });
    element.addEventListener('dragleave', () => element.classList.remove('drag-over'));
    element.addEventListener('drop', (event) => {
      event.preventDefault();
      element.classList.remove('drag-over');
      moveTask(event.dataTransfer.getData('text/plain'), element.dataset.dropDate);
    });
  });
}

function activeDeadlines() {
  return data.deadlines.filter((item) => !item.isIgnored).sort((a, b) => Math.abs(daysFromToday(a.dueDate)) - Math.abs(daysFromToday(b.dueDate)));
}

function deadlineItem(item) {
  const days = daysFromToday(item.dueDate);
  const display = days >= 0 ? `${days}<small>天</small>` : `+${Math.abs(days)}<small>天</small>`;
  return `<div class="deadline-item" data-action="edit-deadline" data-id="${item.id}">
    <div class="deadline-copy"><b>${escapeHTML(item.title)}</b><small>${formatShortDate(item.dueDate)}</small></div>
    <div class="deadline-days">${display}</div>
  </div>`;
}

function renderRightRail() {
  const mode = currentMode();
  const todayStart = startOfDay(new Date());
  const todayDuration = intervalAttendance(todayStart, endOfDay(todayStart));
  const active = data.attendanceSessions.find((item) => !item.leftAt);
  const personal = activeDeadlines().filter((item) => item.kind === 'deadline').slice(0, 6);
  $('#right-rail').innerHTML = `
    <section class="rail-card">
      <div class="rail-title"><span>${iconSVG(mode.icon)}</span>${mode.attendance}</div>
      <div class="attendance-block">
        <div class="attendance-icon">${iconSVG(active ? 'location' : mode.icon)}</div>
        <div class="attendance-text"><b>${mode.today} ${durationText(todayDuration)}</b><small>${active ? `本段从 ${formatTime(active.arrivedAt)} 开始` : mode.idleHint}</small></div>
        <button class="clock-button" data-action="clock">${active ? '结束' : '开始'}</button>
      </div>
    </section>
    <section class="rail-card">
      <div class="rail-title"><span>↔</span>本周习惯 <button class="text-button" data-action="manage-habits">管理</button></div>
      <div class="habit-list">${data.habits.length ? data.habits.map((habit) => {
        const count = weekHabitCount(habit.id);
        return `<div class="habit-row"><div class="habit-line"><div><b>${escapeHTML(habit.name)}</b><small>　${count}/${habit.weeklyTarget}</small></div><div class="habit-buttons"><button class="undo" data-action="undo-habit" data-id="${habit.id}">↶</button><button data-action="check-habit" data-id="${habit.id}">✓ +1</button></div></div><div class="progress"><i style="width:${Math.min(100, count / habit.weeklyTarget * 100)}%;background:var(--green)"></i></div></div>`;
      }).join('') : '<div class="empty-block">添加一个每周习惯目标</div>'}</div>
    </section>
    <section class="rail-card">
      <div class="rail-title"><span>◷</span>最近 DDL <button class="text-button" data-action="manage-deadlines">管理</button></div>
      <div class="deadline-section">
        <div class="deadline-subtitle">我的 DDL <span>${personal.length}</span></div>
        ${personal.length ? personal.map((item) => deadlineItem(item)).join('') : '<div class="empty-block">还没有个人 DDL</div>'}
      </div>
    </section>`;
}

function renderDrawer() {
  const tasks = data.tasks.filter((task) => task.scheduleKind === 'inbox' && !task.completedAt);
  $('#drawer-list').innerHTML = tasks.length ? tasks.map((task) => `<div class="drawer-task" draggable="true" data-drag-task="${task.id}" data-action="edit-task" data-id="${task.id}">${escapeHTML(task.title)}</div>`).join('') : '<div class="empty-block">没有待安排任务</div>';
  bindCalendarDrag();
}

function renderAll() {
  if (!data) return;
  applyWorkspaceMode();
  $('#full-date').textContent = formatFullDate(new Date());
  const totalDeadlines = activeDeadlines().length;
  $('#ddl-count').textContent = totalDeadlines;
  renderDashboard();
  renderToday();
  renderCalendar();
  renderRightRail();
  renderDrawer();
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
  saveAndRender();
}

function moveTask(id, targetDate) {
  const task = data.tasks.find((item) => item.id === id);
  if (!task) return;
  const target = startOfDay(targetDate);
  if (task.scheduleKind === 'range' && task.start) {
    const span = Math.max(0, Math.round((startOfDay(task.end || task.start) - startOfDay(task.start)) / DAY_MS));
    task.start = target.toISOString();
    task.end = addDays(target, span).toISOString();
  } else if (task.scheduleKind === 'fixed' && task.start) {
    const old = new Date(task.start);
    target.setHours(old.getHours(), old.getMinutes(), 0, 0);
    if (task.end) {
      const duration = new Date(task.end) - old;
      task.end = new Date(target.getTime() + duration).toISOString();
    }
    task.start = target.toISOString();
  } else {
    task.scheduleKind = 'day';
    task.start = target.toISOString();
    task.end = null;
  }
  saveAndRender();
  showToast(`已安排到 ${formatShortDate(target)}`);
}

function modal(html) {
  $('#modal-card').className = 'modal-card';
  $('#modal-card').innerHTML = html;
  $('#modal-layer').classList.add('open');
  $('#modal-layer').setAttribute('aria-hidden', 'false');
}
function closeModal() {
  $('#modal-layer').classList.remove('open');
  $('#modal-layer').setAttribute('aria-hidden', 'true');
  $('#modal-card').className = 'modal-card';
  $('#modal-card').innerHTML = '';
}

async function openSettings() {
  const settings = normalizedSettings();
  const system = await window.yanxu.getSystemSettings();
  modal(`<div class="modal-header"><h2>设置</h2><button class="modal-close" data-action="close-modal">×</button></div>
    <div class="modal-body settings-page">
      <section class="settings-section mode-settings-section">
        <div class="settings-section-head"><div><h3>工作区模式</h3><p>切换场景后，主色、快捷提示、数据看板与打卡文案会同步变化；已有数据保持共享。</p></div></div>
        <div class="mode-options">
          ${Object.entries(WORKSPACE_MODES).map(([key, mode]) => `<button type="button" class="mode-option ${settings.workspaceMode === key ? 'active' : ''}" data-setting-mode="${key}"><span>${iconSVG(mode.icon)}</span><b>${mode.label}</b><small>${mode.description}</small><i>✓</i></button>`).join('')}
        </div>
      </section>
      <section class="settings-section">
        <div class="settings-section-head"><div><h3>外观</h3><p>与 macOS 的自适应配色一致，可跟随 Windows 系统主题。</p></div></div>
        <div class="setting-options">
          <label class="setting-option"><input type="radio" name="theme" value="system" ${settings.theme === 'system' ? 'checked' : ''}><b>跟随系统</b><small>自动使用 Windows 的浅色或深色模式</small></label>
          <label class="setting-option"><input type="radio" name="theme" value="light" ${settings.theme === 'light' ? 'checked' : ''}><b>浅色</b><small>始终使用明亮的工作台配色</small></label>
          <label class="setting-option"><input type="radio" name="theme" value="dark" ${settings.theme === 'dark' ? 'checked' : ''}><b>深色</b><small>始终使用低亮度深色配色</small></label>
        </div>
      </section>
      <section class="settings-section">
        <div class="settings-section-head"><div><h3>计划</h3><p>设置主日历每次启动时显示的计划范围。</p></div></div>
        <div class="setting-line"><div class="setting-copy"><b>默认日历视图</b><small>每次启动时首先显示的计划范围</small></div><div class="segmented setting-view"><button data-setting-view="week" class="${settings.defaultCalendarView === 'week' ? 'active' : ''}">周</button><button data-setting-view="month" class="${settings.defaultCalendarView === 'month' ? 'active' : ''}">月</button></div></div>
      </section>
      <section class="settings-section">
        <div class="settings-section-head"><div><h3>Windows</h3><p>系统启动与窗口行为。</p></div></div>
        <div class="setting-line"><div class="setting-copy"><b>登录时启动研序</b><small>登录 Windows 后自动打开主工作台</small></div><label class="switch"><input id="setting-login" type="checkbox" ${system.launchAtLogin ? 'checked' : ''}><i></i></label></div>
      </section>
      <section class="settings-section">
        <div class="settings-section-head"><div><h3>本地数据</h3><p>研序不需要账号，任务、打卡、习惯和 DDL 都保存在本机。</p></div></div>
        <div class="settings-buttons"><button class="outline-button" data-action="open-data-folder">打开数据位置</button><button class="outline-button" data-action="export-backup">导出备份</button><button class="outline-button" data-action="import-backup">导入备份</button><button class="danger-button" data-action="restore-examples">恢复示例工作区</button></div>
        <div class="settings-path" title="${escapeHTML(system.dataPath)}">${escapeHTML(system.dataPath)}</div>
      </section>
      <section class="settings-section"><div class="settings-about"><img src="../../Resources/AppIcon-source.png" alt=""><div><b>研序 Windows</b><small id="settings-mode-description">版本 ${escapeHTML(system.appVersion)} · 本地优先的${currentMode().short}工作台</small></div></div></section>
    </div>`);
  $('#modal-card').classList.add('settings-card');
  $$('[data-setting-mode]', $('#modal-card')).forEach((button) => button.addEventListener('click', () => {
    data.settings.workspaceMode = button.dataset.settingMode;
    $$('[data-setting-mode]', $('#modal-card')).forEach((item) => item.classList.toggle('active', item === button));
    applyWorkspaceMode();
    renderAll();
    $('#settings-mode-description').textContent = `版本 ${system.appVersion} · 本地优先的${currentMode().short}工作台`;
    save();
    showToast(`已切换为${currentMode().label}`);
  }));
  $$('input[name="theme"]', $('#modal-card')).forEach((input) => input.addEventListener('change', () => {
    data.settings.theme = input.value; applyTheme(); save();
  }));
  $$('[data-setting-view]', $('#modal-card')).forEach((button) => button.addEventListener('click', () => {
    data.settings.defaultCalendarView = button.dataset.settingView;
    calendarView = button.dataset.settingView;
    $$('[data-setting-view]', $('#modal-card')).forEach((item) => item.classList.toggle('active', item === button));
    renderCalendar(); save();
  }));
  $('#setting-login').addEventListener('change', async (event) => {
    const result = await window.yanxu.setLaunchAtLogin(event.currentTarget.checked);
    event.currentTarget.checked = result.launchAtLogin;
    showToast(result.launchAtLogin ? '已设置登录时启动' : '已关闭登录时启动');
  });
}

function openTaskEditor(id = null, defaultDate = null) {
  const existing = id ? data.tasks.find((item) => item.id === id) : null;
  const fallbackStart = defaultDate ? startOfDay(defaultDate) : null;
  const task = existing || {
    id: uid(), title: '', notes: '', scheduleKind: defaultDate ? 'day' : 'inbox', start: fallbackStart?.toISOString() || null,
    end: null, repeatRule: 'none', completedAt: null, completedOccurrenceKeys: [], createdAt: nowISO()
  };
  modal(`<form id="task-form">
    <div class="modal-header"><h2>${existing ? '编辑任务' : '新建任务'}</h2><button type="button" class="modal-close" data-action="close-modal">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field full"><label>任务名称</label><input name="title" required autofocus maxlength="120" value="${escapeHTML(task.title)}" placeholder="要完成什么？"></div>
      <div class="field full"><label>备注</label><textarea name="notes" placeholder="补充材料、链接或说明">${escapeHTML(task.notes || '')}</textarea></div>
      <div class="field"><label>计划方式</label><select name="scheduleKind">
        <option value="inbox" ${task.scheduleKind === 'inbox' ? 'selected' : ''}>无日期 / 待安排</option>
        <option value="day" ${task.scheduleKind === 'day' ? 'selected' : ''}>某一天</option>
        <option value="fixed" ${task.scheduleKind === 'fixed' ? 'selected' : ''}>具体时间</option>
        <option value="range" ${task.scheduleKind === 'range' ? 'selected' : ''}>日期范围</option>
      </select></div>
      <div class="field"><label>重复</label><select name="repeatRule">
        <option value="none" ${task.repeatRule === 'none' ? 'selected' : ''}>不重复</option>
        <option value="daily" ${task.repeatRule === 'daily' ? 'selected' : ''}>每天</option>
        <option value="weekly" ${task.repeatRule === 'weekly' ? 'selected' : ''}>每周</option>
        <option value="monthly" ${task.repeatRule === 'monthly' ? 'selected' : ''}>每月</option>
      </select></div>
      <div class="field" data-date-field><label>开始</label><input name="start" type="${task.scheduleKind === 'fixed' ? 'datetime-local' : 'date'}" value="${task.scheduleKind === 'fixed' ? dateTimeInputValue(task.start) : dateInputValue(task.start)}"></div>
      <div class="field" data-end-field><label>结束（仅日期范围）</label><input name="end" type="date" value="${dateInputValue(task.end)}"></div>
    </div></div>
    <div class="modal-footer">${existing ? '<button type="button" class="danger-button" data-action="delete-task" data-id="' + task.id + '">删除任务</button>' : ''}<button type="button" class="outline-button" data-action="close-modal">取消</button><button class="primary-button" type="submit">保存</button></div>
  </form>`);
  const form = $('#task-form');
  const schedule = form.elements.scheduleKind;
  function updateFields() {
    const kind = schedule.value;
    const startInput = form.elements.start;
    const endInput = form.elements.end;
    $('[data-date-field]', form).style.display = kind === 'inbox' ? 'none' : '';
    $('[data-end-field]', form).style.display = kind === 'range' ? '' : 'none';
    startInput.required = kind !== 'inbox';
    endInput.required = kind === 'range';
    const desiredType = kind === 'fixed' ? 'datetime-local' : 'date';
    if (startInput.type !== desiredType) {
      const current = startInput.value ? new Date(startInput.value) : new Date();
      startInput.type = desiredType;
      startInput.value = desiredType === 'datetime-local' ? dateTimeInputValue(current) : dateInputValue(current);
    }
    if (kind !== 'inbox' && !startInput.value) startInput.value = desiredType === 'datetime-local' ? dateTimeInputValue(new Date()) : dateInputValue(new Date());
  }
  schedule.addEventListener('change', updateFields);
  updateFields();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const kind = formData.get('scheduleKind');
    const title = formData.get('title').trim();
    const startValue = formData.get('start');
    const endValue = formData.get('end');
    if (!title) {
      form.elements.title.setCustomValidity('请输入任务名称');
      form.elements.title.reportValidity();
      form.elements.title.addEventListener('input', () => form.elements.title.setCustomValidity(''), { once: true });
      return;
    }
    if (kind !== 'inbox' && !startValue) { showToast('请选择开始日期'); return; }
    const start = kind === 'inbox' ? null : fromLocalInput(startValue);
    const end = kind === 'range' ? fromLocalInput(endValue) : null;
    if (kind === 'range' && (!end || new Date(end) < new Date(start))) {
      showToast('结束日期不能早于开始日期');
      form.elements.end.focus();
      return;
    }
    Object.assign(task, {
      title, notes: formData.get('notes').trim(), scheduleKind: kind, start, end,
      repeatRule: formData.get('repeatRule')
    });
    if (!existing) data.tasks.push(task);
    saveAndRender(); closeModal(); showToast(existing ? '任务已更新' : '任务已创建');
  });
  setTimeout(() => form.elements.title.focus(), 50);
}

function openDeadlineManager(editId = null) {
  const editing = editId ? data.deadlines.find((item) => item.id === editId) : null;
  modal(`<div class="modal-header"><h2>里程碑与 DDL</h2><button class="modal-close" data-action="close-modal">×</button></div>
    <div class="modal-body">
      <form id="deadline-form"><div class="form-grid">
        <div class="field full"><label>名称</label><input name="title" required value="${escapeHTML(editing?.title || '')}" placeholder="例如：论文投稿截止"></div>
        <div class="field"><label>类型</label><select name="kind"><option value="deadline" ${editing?.kind !== 'milestone' ? 'selected' : ''}>DDL</option><option value="milestone" ${editing?.kind === 'milestone' ? 'selected' : ''}>正向里程碑</option></select></div>
        <div class="field"><label>日期</label><input name="dueDate" type="date" required value="${dateInputValue(editing?.dueDate || addDays(new Date(), 7))}"></div>
      </div><div class="modal-footer" style="padding:14px 0 0">${editing ? `<button type="button" class="danger-button" data-action="delete-deadline" data-id="${editing.id}">删除</button>` : ''}<button class="primary-button" type="submit">${editing ? '保存修改' : '添加'}</button></div></form>
      <div class="manage-list">${activeDeadlines().map((item) => `<div class="manage-row"><div class="copy"><b>${escapeHTML(item.title)}</b><small>${item.kind === 'milestone' ? '已坚持' : '还剩'} ${Math.abs(daysFromToday(item.dueDate))} 天 · ${formatShortDate(item.dueDate)}</small></div><button data-action="edit-deadline" data-id="${item.id}">编辑</button></div>`).join('') || '<div class="empty-block">还没有里程碑</div>'}</div>
    </div>`);
  $('#deadline-form').addEventListener('submit', (event) => {
    event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form);
    const title = fd.get('title').trim();
    if (!title) { showToast('请输入名称'); form.elements.title.focus(); return; }
    const item = editing || { id: uid(), includesTime: false, isIgnored: false, createdAt: nowISO() };
    item.title = title; item.kind = fd.get('kind'); item.dueDate = fromLocalInput(fd.get('dueDate'));
    if (!editing) data.deadlines.push(item);
    saveAndRender(); openDeadlineManager(); showToast(editing ? '已更新' : '已添加');
  });
}

function openHabitManager() {
  modal(`<div class="modal-header"><h2>习惯管理</h2><button class="modal-close" data-action="close-modal">×</button></div>
    <div class="modal-body"><form id="habit-form"><div class="form-grid"><div class="field"><label>习惯名称</label><input name="name" required placeholder="例如：英文写作"></div><div class="field"><label>每周目标次数</label><input name="target" type="number" min="1" max="99" value="3" required></div></div><div class="modal-footer" style="padding:14px 0 0"><button class="primary-button">添加习惯</button></div></form>
      <div class="manage-list">${data.habits.map((habit) => `<div class="manage-row"><div class="copy"><b>${escapeHTML(habit.name)}</b><small>每周 ${habit.weeklyTarget} 次 · 本周完成 ${weekHabitCount(habit.id)} 次</small></div><button data-action="delete-habit" data-id="${habit.id}">删除</button></div>`).join('') || '<div class="empty-block">还没有习惯</div>'}</div></div>`);
  $('#habit-form').addEventListener('submit', (event) => {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    const name = fd.get('name').trim();
    if (!name) { showToast('请输入习惯名称'); event.currentTarget.elements.name.focus(); return; }
    data.habits.push({ id: uid(), name, weeklyTarget: Math.max(1, Number(fd.get('target'))), createdAt: nowISO() });
    saveAndRender(); openHabitManager(); showToast('习惯已添加');
  });
}

function recordsInterval() {
  const date = startOfDay(recordsState.selectedDate);
  if (recordsState.period === 'day') return { start: date, end: addDays(date, 1) };
  if (recordsState.period === 'month') return { start: monthStart(date), end: monthEnd(date) };
  const start = mondayOf(date);
  return { start, end: addDays(start, 7) };
}

function recordsPeriodTitle() {
  const { start, end } = recordsInterval();
  if (recordsState.period === 'day') return `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()} 日 · ${weekday(start)}`;
  if (recordsState.period === 'month') return `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`;
  const last = addDays(end, -1);
  return start.getMonth() === last.getMonth()
    ? `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()}–${last.getDate()} 日`
    : `${start.getMonth() + 1} 月 ${start.getDate()} 日 – ${last.getMonth() + 1} 月 ${last.getDate()} 日`;
}

function moveRecordsPeriod(direction) {
  const current = new Date(recordsState.selectedDate);
  if (recordsState.period === 'day') recordsState.selectedDate = addDays(current, direction);
  else if (recordsState.period === 'week') recordsState.selectedDate = addDays(current, direction * 7);
  else recordsState.selectedDate = new Date(current.getFullYear(), current.getMonth() + direction, 1);
}

function attendancePoints(start, end, granularity = 'day') {
  const points = [];
  if (granularity === 'week') {
    for (let cursor = new Date(start), index = 1; cursor < end; cursor = addDays(cursor, 7), index += 1) {
      const stop = new Date(Math.min(addDays(cursor, 7).getTime(), end.getTime()));
      points.push({ label: `第 ${index} 周`, value: intervalAttendance(cursor, stop) / 3600000 });
    }
    return points;
  }
  for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) {
    points.push({
      label: recordsState.period === 'month' ? String(cursor.getDate()) : ['日', '一', '二', '三', '四', '五', '六'][cursor.getDay()],
      value: intervalAttendance(cursor, addDays(cursor, 1)) / 3600000
    });
  }
  return points;
}

function attendanceChart(points) {
  const mode = currentMode();
  const width = 860;
  const height = 265;
  const plot = { left: 52, right: 834, top: 28, bottom: 205 };
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const axisMax = Math.max(2, Math.ceil(maxValue / 2) * 2);
  const x = (index) => points.length <= 1 ? (plot.left + plot.right) / 2 : plot.left + (plot.right - plot.left) * index / (points.length - 1);
  const y = (value) => plot.bottom - (plot.bottom - plot.top) * value / axisMax;
  const coords = points.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);
  const area = coords.length ? `M${plot.left},${plot.bottom} L${coords.join(' L')} L${plot.right},${plot.bottom} Z` : '';
  const labelEvery = points.length > 18 ? 3 : points.length > 10 ? 2 : 1;
  const grid = [0, .25, .5, .75, 1].map((fraction) => {
    const lineY = plot.bottom - (plot.bottom - plot.top) * fraction;
    return `<line x1="${plot.left}" y1="${lineY}" x2="${plot.right}" y2="${lineY}"/><text x="43" y="${lineY + 4}" text-anchor="end">${Math.round(axisMax * fraction * 10) / 10}h</text>`;
  }).join('');
  const labels = points.map((point, index) => index % labelEvery === 0 || index === points.length - 1 ? `<text x="${x(index)}" y="233" text-anchor="middle">${escapeHTML(point.label)}</text>` : '').join('');
  const dots = points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="3.5"><title>${escapeHTML(point.label)}：${point.value.toFixed(1)} 小时</title></circle>`).join('');
  return `<svg class="records-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${mode.duration}趋势图">
    <g class="records-chart-grid">${grid}</g>
    <path class="records-chart-area" d="${area}"/>
    <polyline class="records-chart-line" points="${coords.join(' ')}"/>
    <g class="records-chart-dots">${dots}</g>
    <g class="records-chart-labels">${labels}</g>
  </svg>`;
}

function recordsMetric(icon, color, title, value, subtitle) {
  return `<article class="record-metric ${color}"><div class="record-metric-icon">${iconSVG(icon)}</div><div><span>${title}</span><strong>${value}</strong><small>${subtitle}</small></div></article>`;
}

function attendanceRows(sessions, { compact = false, clipStart = null, clipEnd = null } = {}) {
  const mode = currentMode();
  if (!sessions.length) return `<div class="records-empty">这段时间还没有${mode.session}记录</div>`;
  return `<div class="attendance-history">${sessions.map((item) => `<div class="attendance-history-row">
    <div class="attendance-history-icon">${iconSVG(item.leftAt ? mode.icon : 'location')}</div>
    <div class="attendance-history-copy"><b>${formatShortDate(item.arrivedAt)} · ${weekday(item.arrivedAt)}</b><span>${formatTime(item.arrivedAt)} 到 ${item.leftAt ? formatTime(item.leftAt) : '进行中'}</span></div>
    <strong>${compactDuration(clipStart && clipEnd ? overlapDuration(item, clipStart, clipEnd) : new Date(item.leftAt || new Date()) - new Date(item.arrivedAt))}</strong>
    ${compact ? '' : `<button class="record-icon-button" data-action="edit-session" data-id="${item.id}">编辑</button><button class="record-icon-button danger" data-action="delete-session" data-id="${item.id}">删除</button>`}
  </div>`).join('')}</div>`;
}

function dashboardRecordsContent() {
  const mode = currentMode();
  const { start, end } = recordsInterval();
  const attendance = intervalAttendance(start, end);
  const planned = plannedInInterval(start, end);
  const completed = completedInInterval(start, end);
  const habitCount = data.habitLogs.filter((item) => inInterval(item.timestamp, start, end)).length;
  const chartGranularity = recordsState.period === 'month' ? recordsState.monthGranularity : 'day';
  const points = attendancePoints(start, end, chartGranularity);
  const sessions = [...data.attendanceSessions]
    .filter((item) => overlapDuration(item, start, end) > 0)
    .sort((a, b) => new Date(b.arrivedAt) - new Date(a.arrivedAt));
  const habits = data.habits.map((habit) => ({
    ...habit,
    count: data.habitLogs.filter((item) => item.habitID === habit.id && inInterval(item.timestamp, start, end)).length
  }));
  return `<div class="records-dashboard">
    <div class="records-toolbar">
      <div class="records-date-nav"><button data-action="records-move" data-direction="-1">‹</button><button data-action="records-today">今天</button><button data-action="records-move" data-direction="1">›</button><h3>${recordsPeriodTitle()}</h3></div>
      <div class="segmented records-period"><button data-action="records-period" data-period="day" class="${recordsState.period === 'day' ? 'active' : ''}">日</button><button data-action="records-period" data-period="week" class="${recordsState.period === 'week' ? 'active' : ''}">周</button><button data-action="records-period" data-period="month" class="${recordsState.period === 'month' ? 'active' : ''}">月</button></div>
    </div>
    <div class="records-metrics">
      ${recordsMetric('clock', 'blue', mode.duration, compactDuration(attendance), `${sessions.length} 个${mode.session}`)}
      ${recordsMetric('check', 'green', '完成任务', `${completed} / ${planned}`, planned ? `完成率 ${Math.round(completed / planned * 100)}%` : '暂无计划任务')}
      ${recordsMetric('repeat', 'violet', '习惯打卡', `${habitCount} 次`, `${habits.filter((habit) => habit.count > 0).length} 个习惯有记录`)}
    </div>
    ${recordsState.period === 'day' ? `<section class="records-panel"><div class="records-panel-head"><div><h3>当日${mode.session}</h3><p>开始、结束与当日实际投入时长</p></div></div>${attendanceRows(sessions, { compact: true, clipStart: start, clipEnd: end })}</section>` : `<section class="records-panel">
      <div class="records-panel-head"><div><h3>${recordsState.period === 'week' ? `本周每日${mode.duration}` : `本月${mode.duration}趋势`}</h3><p>合计 ${durationText(attendance)}，鼠标悬停数据点可查看精确时长</p></div>${recordsState.period === 'month' ? `<div class="segmented records-granularity"><button data-action="records-granularity" data-granularity="day" class="${recordsState.monthGranularity === 'day' ? 'active' : ''}">按日</button><button data-action="records-granularity" data-granularity="week" class="${recordsState.monthGranularity === 'week' ? 'active' : ''}">按周</button></div>` : ''}</div>
      <div class="records-chart">${attendanceChart(points)}</div>
    </section>`}
    <section class="records-panel"><div class="records-panel-head"><div><h3>习惯完成</h3><p>当前所选时间范围内的打卡记录</p></div><button class="outline-button" data-action="records-section" data-section="habits">管理习惯</button></div>
      <div class="record-habit-summary">${habits.map((habit) => `<div><span>${escapeHTML(habit.name)}</span><b>${habit.count} 次</b><i style="width:${Math.min(100, habit.count / Math.max(1, habit.weeklyTarget) * 100)}%"></i></div>`).join('') || '<div class="empty-block">还没有习惯</div>'}</div>
    </section>
  </div>`;
}

function habitsRecordsContent() {
  const mode = currentMode();
  const weekStart = mondayOf(new Date());
  const weekStop = addDays(weekStart, 7);
  return `<div class="records-dashboard">
    <div class="records-section-intro"><div><h2>习惯</h2><p>按周追踪${mode.short}习惯，在这里打卡或撤销最近一次记录。</p></div><button class="primary-button" data-action="manage-habits">＋ 添加习惯</button></div>
    <div class="record-habit-grid">${data.habits.map((habit) => {
      const logs = data.habitLogs.filter((item) => item.habitID === habit.id && inInterval(item.timestamp, weekStart, weekStop)).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const progress = Math.min(100, logs.length / Math.max(1, habit.weeklyTarget) * 100);
      return `<article class="record-habit-card"><div class="record-habit-card-head"><div><span>本周习惯</span><h3>${escapeHTML(habit.name)}</h3></div><button class="record-delete" data-action="records-delete-habit" data-id="${habit.id}">删除</button></div><div class="record-habit-count"><strong>${logs.length}</strong><span>/ ${habit.weeklyTarget} 次</span></div><div class="record-progress"><i style="width:${progress}%"></i></div><p>${logs.length >= habit.weeklyTarget ? '本周目标已完成，做得不错。' : `还差 ${habit.weeklyTarget - logs.length} 次完成本周目标。`}</p><div class="record-habit-actions"><button data-action="records-undo-habit" data-id="${habit.id}">↶ 撤销</button><button data-action="records-check-habit" data-id="${habit.id}">✓ 打卡 +1</button></div></article>`;
    }).join('') || '<div class="records-empty wide">还没有习惯，添加一个每周目标开始记录。</div>'}</div>
  </div>`;
}

function attendanceRecordsContent() {
  const mode = currentMode();
  const sessions = [...data.attendanceSessions].sort((a, b) => new Date(b.arrivedAt) - new Date(a.arrivedAt));
  const active = sessions.find((item) => !item.leftAt);
  const today = startOfDay(new Date());
  const todayDuration = intervalAttendance(today, addDays(today, 1));
  return `<div class="records-dashboard">
    <div class="records-section-intro"><div><h2>${mode.attendance}记录</h2><p>查看和维护每一段${mode.session}的开始、结束时间。</p></div></div>
    <section class="attendance-current"><div class="attendance-current-icon">${iconSVG(active ? 'location' : mode.icon)}</div><div><span>${active ? mode.active : mode.today}</span><strong>${active ? `从 ${formatTime(active.arrivedAt)} 开始` : durationText(todayDuration)}</strong><small>${active ? `本段已进行 ${durationText(new Date() - new Date(active.arrivedAt))}` : mode.idleHint}</small></div><button class="clock-button" data-action="records-clock">${active ? '记录结束' : '记录开始'}</button></section>
    <section class="records-panel"><div class="records-panel-head"><div><h3>全部${mode.session}</h3><p>共 ${sessions.length} 段，数据仅保存在本机</p></div></div>${attendanceRows(sessions)}</section>
  </div>`;
}

function openRecords(section = recordsState.section) {
  recordsState.section = section;
  const mode = currentMode();
  const content = section === 'habits' ? habitsRecordsContent() : section === 'attendance' ? attendanceRecordsContent() : dashboardRecordsContent();
  modal(`<div class="records-shell">
    <div class="records-header"><div class="records-heading"><h2>${mode.label}记录</h2><span>${mode.recordsSubtitle}</span></div>
      <div class="records-tabs"><button data-action="records-section" data-section="dashboard" class="${section === 'dashboard' ? 'active' : ''}">看板</button><button data-action="records-section" data-section="habits" class="${section === 'habits' ? 'active' : ''}">习惯</button><button data-action="records-section" data-section="attendance" class="${section === 'attendance' ? 'active' : ''}">打卡记录</button></div>
      <button class="modal-close" data-action="close-modal">×</button>
    </div><div class="records-content">${content}</div>
  </div>`);
  $('#modal-card').classList.add('records-card');
}

function openAttendanceEditor(id) {
  const session = data.attendanceSessions.find((item) => item.id === id);
  if (!session) return;
  const mode = currentMode();
  modal(`<form id="attendance-form"><div class="modal-header"><h2>编辑${mode.session}</h2><button type="button" class="modal-close" data-action="records-back-attendance">×</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label>开始时间</label><input name="arrivedAt" type="datetime-local" required value="${dateTimeInputValue(session.arrivedAt)}"></div><div class="field"><label>结束时间</label><input name="leftAt" type="datetime-local" value="${dateTimeInputValue(session.leftAt)}"></div></div><div class="info-box attendance-editor-note">结束时间留空表示这段${mode.short}计时仍在进行。</div></div><div class="modal-footer"><button type="button" class="outline-button" data-action="records-back-attendance">取消</button><button class="primary-button" type="submit">保存修改</button></div></form>`);
  $('#attendance-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const arrivedAt = fromLocalInput(fd.get('arrivedAt'));
    const leftAt = fromLocalInput(fd.get('leftAt'));
    if (leftAt && new Date(leftAt) < new Date(arrivedAt)) { showToast('结束时间不能早于开始时间'); return; }
    session.arrivedAt = arrivedAt;
    session.leftAt = leftAt;
    saveAndRender(); openRecords('attendance'); showToast('打卡记录已更新');
  });
}

function quickAdd(input) {
  const value = input.trim();
  if (!value) return;
  const result = parse(value, new Date());
  data.tasks.push({
    id: uid(), title: result.title, notes: '', scheduleKind: result.scheduleKind, start: result.start, end: null,
    repeatRule: 'none', completedAt: null, completedOccurrenceKeys: [], createdAt: nowISO()
  });
  $('#quick-input').value = '';
  saveAndRender();
  showToast(result.scheduleKind === 'inbox' ? '已加入待安排' : `已安排到 ${formatShortDate(result.start)}${result.recognizedTime ? ` ${formatTime(result.start)}` : ''}`);
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'toggle-task') { event.stopPropagation(); toggleTask(target.dataset.id, target.dataset.date); }
  if (action === 'edit-task') { event.stopPropagation(); openTaskEditor(target.dataset.id); }
  if (action === 'new-on-date') { if (event.target.closest('[data-drag-task]')) return; openTaskEditor(null, target.dataset.date); }
  if (action === 'close-modal') closeModal();
  if (action === 'delete-task') {
    data.tasks = data.tasks.filter((item) => item.id !== target.dataset.id); saveAndRender(); closeModal(); showToast('任务已删除');
  }
  if (action === 'clock') {
    const active = data.attendanceSessions.find((item) => !item.leftAt);
    if (active) active.leftAt = nowISO(); else data.attendanceSessions.push({ id: uid(), arrivedAt: nowISO(), leftAt: null });
    saveAndRender(); showToast(active ? '已记录结束时间' : `已开始${currentMode().short}计时`);
  }
  if (action === 'check-habit') { data.habitLogs.push({ id: uid(), habitID: target.dataset.id, timestamp: nowISO() }); saveAndRender(); }
  if (action === 'undo-habit') {
    const logs = data.habitLogs.filter((item) => item.habitID === target.dataset.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (logs[0]) data.habitLogs = data.habitLogs.filter((item) => item.id !== logs[0].id);
    saveAndRender();
  }
  if (action === 'manage-habits') openHabitManager();
  if (action === 'manage-deadlines') openDeadlineManager();
  if (action === 'edit-deadline') openDeadlineManager(target.dataset.id);
  if (action === 'delete-deadline') { data.deadlines = data.deadlines.filter((item) => item.id !== target.dataset.id); saveAndRender(); openDeadlineManager(); showToast('已删除'); }
  if (action === 'delete-habit') { data.habits = data.habits.filter((item) => item.id !== target.dataset.id); data.habitLogs = data.habitLogs.filter((item) => item.habitID !== target.dataset.id); saveAndRender(); openHabitManager(); }
  if (action === 'records-section') openRecords(target.dataset.section);
  if (action === 'records-period') { recordsState.period = target.dataset.period; openRecords('dashboard'); }
  if (action === 'records-move') { moveRecordsPeriod(Number(target.dataset.direction)); openRecords('dashboard'); }
  if (action === 'records-today') { recordsState.selectedDate = startOfDay(new Date()); openRecords('dashboard'); }
  if (action === 'records-granularity') { recordsState.monthGranularity = target.dataset.granularity; openRecords('dashboard'); }
  if (action === 'records-check-habit') { data.habitLogs.push({ id: uid(), habitID: target.dataset.id, timestamp: nowISO() }); saveAndRender(); openRecords('habits'); }
  if (action === 'records-undo-habit') {
    const logs = data.habitLogs.filter((item) => item.habitID === target.dataset.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (logs[0]) data.habitLogs = data.habitLogs.filter((item) => item.id !== logs[0].id);
    saveAndRender(); openRecords('habits');
  }
  if (action === 'records-delete-habit') {
    data.habits = data.habits.filter((item) => item.id !== target.dataset.id);
    data.habitLogs = data.habitLogs.filter((item) => item.habitID !== target.dataset.id);
    saveAndRender(); openRecords('habits'); showToast('习惯已删除');
  }
  if (action === 'records-clock') {
    const active = data.attendanceSessions.find((item) => !item.leftAt);
    if (active) active.leftAt = nowISO(); else data.attendanceSessions.push({ id: uid(), arrivedAt: nowISO(), leftAt: null });
    saveAndRender(); openRecords('attendance'); showToast(active ? '已记录结束时间' : `已开始${currentMode().short}计时`);
  }
  if (action === 'edit-session') openAttendanceEditor(target.dataset.id);
  if (action === 'records-back-attendance') openRecords('attendance');
  if (action === 'delete-session') { data.attendanceSessions = data.attendanceSessions.filter((item) => item.id !== target.dataset.id); saveAndRender(); openRecords('attendance'); showToast('打卡记录已删除'); }
  if (action === 'open-data-folder') { await window.yanxu.openDataFolder(); showToast('已打开数据文件位置'); }
  if (action === 'export-backup') {
    const result = await window.yanxu.exportBackup();
    if (result.ok) showToast('数据备份已导出');
  }
  if (action === 'import-backup') {
    const result = await window.yanxu.importBackup();
    if (result.ok) {
      data = result.data; applyTheme(); calendarView = normalizedSettings().defaultCalendarView; closeModal(); renderAll(); showToast('数据备份已导入');
    } else if (!result.canceled) showToast(result.error || '导入失败');
  }
  if (action === 'restore-examples') {
    if (window.confirm('恢复示例工作区会替换当前所有任务、打卡、习惯和 DDL。是否继续？')) {
      const result = await window.yanxu.createExampleData();
      if (result.ok) { data = result.data; applyTheme(); calendarAnchor = startOfDay(new Date()); calendarView = normalizedSettings().defaultCalendarView; closeModal(); renderAll(); showToast('已恢复示例工作区'); }
    }
  }
});

$('#new-task').addEventListener('click', () => openTaskEditor());
$('#calendar-new').addEventListener('click', () => openTaskEditor());
$('#settings-open').addEventListener('click', openSettings);
$('#deadline-manage').addEventListener('click', () => openDeadlineManager());
$('#records-open').addEventListener('click', () => openRecords('dashboard'));
$('#quick-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') quickAdd(event.currentTarget.value); });
$('#calendar-prev').addEventListener('click', () => { calendarAnchor = calendarView === 'week' ? addDays(calendarAnchor, -7) : new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() - 1, 1); renderCalendar(); });
$('#calendar-next').addEventListener('click', () => { calendarAnchor = calendarView === 'week' ? addDays(calendarAnchor, 7) : new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() + 1, 1); renderCalendar(); });
$('#calendar-today').addEventListener('click', () => { calendarAnchor = startOfDay(new Date()); renderCalendar(); });
$$('.segmented button').forEach((button) => button.addEventListener('click', () => { calendarView = button.dataset.view; renderCalendar(); }));
$('#inbox-drawer').addEventListener('click', () => document.body.classList.add('drawer-open'));
$('#drawer-backdrop').addEventListener('click', () => document.body.classList.remove('drawer-open'));
$('[data-close-drawer]').addEventListener('click', () => document.body.classList.remove('drawer-open'));
$('#modal-layer').addEventListener('mousedown', (event) => { if (event.target === event.currentTarget) closeModal(); });
$$('[data-window]').forEach((button) => button.addEventListener('click', () => window.yanxu.windowAction(button.dataset.window)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeModal(); document.body.classList.remove('drawer-open'); }
  if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); openTaskEditor(); }
});

window.yanxu.onStateChanged((next) => { data = next; applyTheme(); renderAll(); });
systemTheme.addEventListener('change', () => { if (data && normalizedSettings().theme === 'system') applyTheme(); });

async function init() {
  data = await window.yanxu.loadState();
  const params = new URLSearchParams(location.search);
  const previewMode = params.get('mode');
  if (WORKSPACE_MODES[previewMode]) normalizedSettings().workspaceMode = previewMode;
  applyTheme();
  calendarView = normalizedSettings().defaultCalendarView;
  renderAll();
  const preview = params.get('preview');
  if (preview === 'settings') await openSettings();
  if (preview === 'records') openRecords('dashboard');
  setInterval(() => { renderDashboard(); renderRightRail(); }, 60000);
}

init();
