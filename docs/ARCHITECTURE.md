# Windows 版架构

## 进程边界

研序 Windows 使用 Electron 的标准三层结构：

```text
主进程 src/main.js
  │  IPC（只暴露明确能力）
  ▼
预加载 src/preload.js
  │  contextBridge
  ▼
渲染进程 src/renderer/*
```

- **主进程：** 管理主窗口与桌面卡片、本地 JSON、启动项、文件选择和备份；
- **预加载：** 把允许使用的 IPC 方法放入 `window.yanxu`；
- **渲染进程：** `index.html` 负责主工作台，`widget.html` 负责桌面卡片；两者只通过预加载层同步状态，不直接访问 Node.js；
- **共享模块：** `quick-parser.js` 和 `workspace-modes.js` 同时支持浏览器与 Node.js 测试。

## 本地数据

`data.json` 是唯一持久化数据源。主进程中的 `DATA_VERSION` 控制迁移版本，所有读取和导入都必须经过 `normalizeData()`。

新增字段时应遵循：

1. 提升 `DATA_VERSION`；
2. 在 `emptyData()` 中提供默认值；
3. 在 `normalizeData()` 中验证旧值并安全回退；
4. 补充自动测试或隔离数据迁移测试；
5. 确认导入旧备份后仍能启动。

保存操作使用串行 Promise 队列，防止连续交互造成写入交错。写入先落到 `.tmp` 文件，再通过重命名替换正式文件。

主工作台或桌面卡片保存后，主进程把规范化后的状态广播给另一个窗口。桌面卡片的位置、启用状态与锁定状态保存在同一个 `settings` 对象中；卡片固定使用为桌面阅读优化的浅色外观。

## 工作区模式

三种模式的文案和图标集中在 `src/shared/workspace-modes.js`。渲染时通过 `data-mode` 属性切换 CSS 变量，因此新增模式至少需要：

- 增加完整模式配置；
- 增加浅色与深色 CSS 变量；
- 更新模式测试；
- 验证设置、主工作台和记录看板。

模式不是独立数据空间。任务、打卡、习惯和 DDL 始终共享，`workspaceMode` 只控制显示与语义。

## 安全约束

- `contextIsolation: true`；
- `nodeIntegration: false`；
- `sandbox: true`；
- 本地页面通过 Content Security Policy 限制资源来源；
- 渲染进程只使用预加载层声明的接口；
- 用户文本写入 HTML 前使用 `escapeHTML()`。

新增系统能力时，应先在主进程实现最小 IPC，再通过预加载层暴露单一用途的方法，避免把通用文件系统或 shell 权限交给渲染进程。

## 发布检查

```powershell
npm ci
npm run check
npm audit
npm run dist:portable
```

发布前还应使用一个隔离的数据路径验证首次启动、旧数据迁移、备份导入，以及科研、工作、学习三种模式。

