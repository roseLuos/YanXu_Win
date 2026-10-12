const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeWorkspaceMode } = require('./shared/workspace-modes');

let mainWindow = null;
let widgetWindow = null;
let cachedData = null;
let saveQueue = Promise.resolve();
let widgetBoundsTimer = null;
const DATA_VERSION = 8;
const WIDGET_SIZE = Object.freeze({ width: 930, height: 478 });

function emptyData() {
  return {
    version: DATA_VERSION,
    tasks: [],
    deadlines: [],
    habits: [],
    habitLogs: [],
    attendanceSessions: [],
    ignoredOverdueOccurrenceKeys: [],
    examplesInitialized: false,
    settings: {
      theme: 'system',
      defaultCalendarView: 'week',
      workspaceMode: 'research',
      desktopWidgetEnabled: true,
      desktopWidgetLocked: false,
      desktopWidgetAppearance: 'dark',
      desktopWidgetBounds: null
    }
  };
}

function uid() {
  return globalThis.crypto.randomUUID();
}

function isoAt(dayOffset, hour = 9, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

function demoData() {
  const now = new Date();
  const taskSpecs = [
    ['查阅近期相关文献', -5, 9, 0, 'day', true],
    ['课题组周会', -4, 14, 0, 'fixed', true],
    ['整理消融实验结果', -3, 9, 0, 'day', true],
    ['预处理训练数据', -2, 10, 30, 'fixed', true],
    ['确认数据库使用许可', -1, 9, 0, 'day', false],
    ['整理实验结果', 0, 9, 30, 'fixed', false],
    ['与导师讨论实验进展', 0, 15, 0, 'fixed', false],
    ['修改论文方法章节', 0, 9, 0, 'day', false],
    ['回复合作者邮件', 0, 9, 0, 'day', true],
    ['统一论文图表格式', 0, 9, 0, 'range', false, 2],
    ['复现实验结果', 1, 10, 0, 'fixed', false],
    ['阅读并标注相关论文', 1, 9, 0, 'day', false],
    ['整理下周实验计划', 2, 9, 0, 'day', false],
    ['提交计算资源申请', 3, 9, 0, 'day', false],
    ['与合作者同步论文结构', 4, 16, 0, 'fixed', false]
  ];
  const tasks = taskSpecs.map(([title, offset, hour, minute, scheduleKind, completed, endOffset], index) => ({
    id: uid(), title, notes: '', scheduleKind, start: isoAt(offset, hour, minute),
    end: scheduleKind === 'range' ? isoAt(offset + (endOffset || 1), hour, minute) : null,
    repeatRule: 'none',
    completedAt: completed ? isoAt(offset, Math.max(hour, 17), minute) : null,
    completedOccurrenceKeys: [], createdAt: isoAt(-20 + index, 8, 0)
  }));
  tasks.push({ id: uid(), title: '梳理博士论文整体大纲', notes: '整理章节结构和各部分实验支撑材料', scheduleKind: 'inbox',
    start: null, end: null, repeatRule: 'none',
    completedAt: null, completedOccurrenceKeys: [], createdAt: isoAt(-2) });
  tasks.push({ id: uid(), title: '尝试新的文献管理工作流', notes: '', scheduleKind: 'inbox',
    start: null, end: null, repeatRule: 'none',
    completedAt: null, completedOccurrenceKeys: [], createdAt: isoAt(-1)
  });
  const habits = [
    { id: uid(), name: '整理实验记录', weeklyTarget: 5, createdAt: isoAt(-30) },
    { id: uid(), name: '英文写作', weeklyTarget: 4, createdAt: isoAt(-30) },
    { id: uid(), name: '阅读论文', weeklyTarget: 5, createdAt: isoAt(-30) }
  ];
  const habitLogs = [
    ...[-4, -2, 0].map((offset) => ({ id: uid(), habitID: habits[0].id, timestamp: isoAt(offset, 18, 10) })),
    ...[-3, -1].map((offset) => ({ id: uid(), habitID: habits[1].id, timestamp: isoAt(offset, 20, 0) })),
    ...[-5, -3, -1, 0].map((offset) => ({ id: uid(), habitID: habits[2].id, timestamp: isoAt(offset, 21, 0) }))
  ];
  const attendanceSessions = [
    { id: uid(), arrivedAt: isoAt(-4, 8, 48), leftAt: isoAt(-4, 17, 41) },
    { id: uid(), arrivedAt: isoAt(-3, 9, 5), leftAt: isoAt(-3, 18, 12) },
    { id: uid(), arrivedAt: isoAt(-2, 8, 36), leftAt: isoAt(-2, 17, 25) },
    { id: uid(), arrivedAt: isoAt(-1, 9, 12), leftAt: isoAt(-1, 19, 3) },
    { id: uid(), arrivedAt: isoAt(0, 8, 42), leftAt: isoAt(0, 11, 55) }
  ];
  return {
    ...emptyData(), examplesInitialized: true, tasks, habits, habitLogs, attendanceSessions,
    deadlines: [
      { id: uid(), title: '论文初稿交给导师', dueDate: isoAt(12), includesTime: false, kind: 'deadline', isIgnored: false, createdAt: now.toISOString() },
      { id: uid(), title: '数据集申请截止', dueDate: isoAt(18), includesTime: false, kind: 'deadline', isIgnored: false, createdAt: now.toISOString() },
      { id: uid(), title: '实验室年度汇报', dueDate: isoAt(45), includesTime: false, kind: 'deadline', isIgnored: false, createdAt: now.toISOString() },
      { id: uid(), title: '开始规律运动', dueDate: isoAt(-36), includesTime: false, kind: 'milestone', isIgnored: false, createdAt: now.toISOString() }
    ]
  };
}

function dataFile() {
  if (process.env.YANXU_DATA_PATH) return path.resolve(process.env.YANXU_DATA_PATH);
  return path.join(app.getPath('userData'), 'data.json');
}

function normalizeData(value) {
  const base = emptyData();
  const source = value && typeof value === 'object' ? value : {};
  const merged = {
    ...base,
    version: DATA_VERSION,
    tasks: source.tasks,
    deadlines: source.deadlines,
    habits: source.habits,
    habitLogs: source.habitLogs,
    attendanceSessions: source.attendanceSessions,
    ignoredOverdueOccurrenceKeys: source.ignoredOverdueOccurrenceKeys,
    examplesInitialized: source.examplesInitialized === true,
    settings: {
      theme: source.settings?.theme || base.settings.theme,
      defaultCalendarView: source.settings?.defaultCalendarView || base.settings.defaultCalendarView,
      workspaceMode: normalizeWorkspaceMode(source.settings?.workspaceMode),
      desktopWidgetEnabled: source.settings?.desktopWidgetEnabled !== false,
      desktopWidgetLocked: source.settings?.desktopWidgetLocked === true,
      desktopWidgetAppearance: source.settings?.desktopWidgetAppearance === 'light' ? 'light' : 'dark',
      desktopWidgetBounds: normalizeWidgetBounds(source.settings?.desktopWidgetBounds)
    }
  };
  for (const key of ['tasks', 'deadlines', 'habits', 'habitLogs', 'attendanceSessions', 'ignoredOverdueOccurrenceKeys']) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  merged.tasks = merged.tasks.map(({ reminderEnabled: _reminder, __notifiedAt: _notified, ...task }) => task);
  return merged;
}

function normalizeWidgetBounds(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y), ...WIDGET_SIZE };
}

function loadData() {
  if (cachedData) return cachedData;
  const file = dataFile();
  try {
    const source = JSON.parse(fs.readFileSync(file, 'utf8'));
    cachedData = normalizeData(source);
    let shouldPersist = source.version !== DATA_VERSION;
    if (source.examplesInitialized !== true) {
      const hasUserContent = ['tasks', 'deadlines', 'habits', 'habitLogs', 'attendanceSessions'].some((key) => Array.isArray(source[key]) && source[key].length > 0);
      if (!hasUserContent) cachedData = demoData();
      else cachedData.examplesInitialized = true;
      shouldPersist = true;
    }
    if (shouldPersist) persistData(cachedData);
  } catch {
    cachedData = process.env.YANXU_EMPTY_DATA === '1' ? { ...emptyData(), examplesInitialized: true } : demoData();
    persistData(cachedData);
  }
  return cachedData;
}

function persistData(data) {
  cachedData = normalizeData(data);
  const file = dataFile();
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(cachedData, null, 2), 'utf8');
    await fs.promises.rename(temporary, file);
  });
  return saveQueue;
}

function iconPath() {
  return path.join(__dirname, '..', 'Resources', 'AppIcon-source.png');
}

function startupExecutable() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function broadcastStateChanged(value = loadData(), excludedWebContentsId = null) {
  for (const target of [mainWindow, widgetWindow]) {
    if (!target || target.isDestroyed() || target.webContents.id === excludedWebContentsId) continue;
    target.webContents.send('state:changed', value);
  }
}

function defaultWidgetBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + (area.width - WIDGET_SIZE.width) / 2),
    y: Math.round(area.y + 28),
    ...WIDGET_SIZE
  };
}

function visibleWidgetBounds(savedBounds) {
  const candidate = normalizeWidgetBounds(savedBounds) || defaultWidgetBounds();
  const displays = screen.getAllDisplays();
  const visible = displays.some(({ workArea }) => (
    candidate.x + 120 >= workArea.x && candidate.x <= workArea.x + workArea.width - 120
      && candidate.y + 60 >= workArea.y && candidate.y <= workArea.y + workArea.height - 60
  ));
  return visible ? candidate : defaultWidgetBounds();
}

function rememberWidgetBounds() {
  clearTimeout(widgetBoundsTimer);
  widgetBoundsTimer = setTimeout(() => {
    if (!widgetWindow || widgetWindow.isDestroyed() || !cachedData) return;
    cachedData.settings.desktopWidgetBounds = widgetWindow.getBounds();
    persistData(cachedData);
  }, 180);
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
  const settings = loadData().settings;
  if (!settings.desktopWidgetEnabled) return null;
  const bounds = visibleWidgetBounds(settings.desktopWidgetBounds);
  widgetWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: false,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  widgetWindow.setMenuBarVisibility(false);
  widgetWindow.loadFile(path.join(__dirname, 'renderer', 'widget.html'));
  widgetWindow.once('ready-to-show', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    if (process.env.YANXU_WIDGET_CAPTURE) {
      setTimeout(async () => {
        const target = path.resolve(process.cwd(), process.env.YANXU_WIDGET_CAPTURE);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const image = await widgetWindow.webContents.capturePage();
        await fs.promises.writeFile(target, image.toPNG());
        app.quit();
      }, 1000);
      return;
    }
    widgetWindow.showInactive();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.focus();
  });
  widgetWindow.on('moved', rememberWidgetBounds);
  widgetWindow.on('closed', () => {
    clearTimeout(widgetBoundsTimer);
    widgetWindow = null;
  });
  return widgetWindow;
}

function setWidgetEnabled(enabled) {
  const state = loadData();
  state.settings.desktopWidgetEnabled = Boolean(enabled);
  if (enabled) createWidgetWindow();
  else if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.destroy();
  return persistData(state).then(() => {
    broadcastStateChanged(state);
    return { ok: true, enabled: state.settings.desktopWidgetEnabled };
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: '#f7f8fb',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: {
      preview: process.env.YANXU_PREVIEW_PANEL || '',
      mode: process.env.YANXU_PREVIEW_MODE || ''
    }
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.env.YANXU_CAPTURE) {
      setTimeout(async () => {
        const target = path.resolve(process.cwd(), process.env.YANXU_CAPTURE);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const image = await mainWindow.webContents.capturePage();
        await fs.promises.writeFile(target, image.toPNG());
        app.quit();
      }, 1800);
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.yanxu.windows');
  loadData();
  if (process.env.YANXU_WIDGET_CAPTURE) createWidgetWindow();
  else {
    createMainWindow();
    createWidgetWindow();
  }

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', async (_event, data) => {
  await persistData(data);
  broadcastStateChanged(cachedData, _event.sender.id);
  return { ok: true };
});
ipcMain.handle('settings:system', () => ({
  launchAtLogin: app.getLoginItemSettings({ path: startupExecutable() }).openAtLogin,
  dataPath: dataFile(),
  appVersion: app.getVersion()
}));
ipcMain.handle('settings:launch-at-login', (_event, enabled) => {
  const executable = startupExecutable();
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: executable });
  return { ok: true, launchAtLogin: app.getLoginItemSettings({ path: executable }).openAtLogin };
});
ipcMain.handle('settings:desktop-widget', (_event, enabled) => setWidgetEnabled(enabled));
ipcMain.handle('settings:desktop-widget-locked', async (_event, locked) => {
  const state = loadData();
  state.settings.desktopWidgetLocked = Boolean(locked);
  await persistData(state);
  broadcastStateChanged(state);
  return { ok: true, locked: state.settings.desktopWidgetLocked };
});
ipcMain.handle('settings:open-data-folder', () => {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(loadData(), null, 2), 'utf8');
  shell.showItemInFolder(file);
  return { ok: true };
});
ipcMain.handle('settings:export-backup', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出研序数据备份',
    defaultPath: path.join(app.getPath('documents'), `研序备份-${new Date().toISOString().slice(0, 10)}.json`),
    filters: [{ name: 'JSON 数据', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  await fs.promises.writeFile(result.filePath, JSON.stringify(loadData(), null, 2), 'utf8');
  shell.showItemInFolder(result.filePath);
  return { ok: true, filePath: result.filePath };
});
ipcMain.handle('settings:import-backup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入研序数据备份',
    properties: ['openFile'],
    filters: [{ name: 'JSON 数据', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  try {
    const imported = normalizeData(JSON.parse(await fs.promises.readFile(result.filePaths[0], 'utf8')));
    imported.examplesInitialized = true;
    await persistData(imported);
    broadcastStateChanged(imported);
    return { ok: true, data: imported };
  } catch (error) {
    return { ok: false, error: `无法导入备份：${error.message}` };
  }
});
ipcMain.handle('settings:example-data', async () => {
  const examples = demoData();
  examples.settings = { ...loadData().settings };
  await persistData(examples);
  broadcastStateChanged(examples);
  return { ok: true, data: examples };
});
ipcMain.handle('window:action', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  if (action === 'close') mainWindow.close();
});
ipcMain.handle('widget:action', async (_event, action) => {
  if (action === 'open-main') showMainWindow();
  if (action === 'close') await setWidgetEnabled(false);
  if (action === 'reset-position' && widgetWindow && !widgetWindow.isDestroyed()) {
    const bounds = defaultWidgetBounds();
    widgetWindow.setBounds(bounds);
    const state = loadData();
    state.settings.desktopWidgetBounds = bounds;
    await persistData(state);
    broadcastStateChanged(state);
  }
  return { ok: true };
});
module.exports = { emptyData, demoData, normalizeData };
