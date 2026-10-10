# 参与贡献

感谢你愿意改进研序 Windows。请让每个 Pull Request 聚焦一个明确问题，并说明用户可见的变化与验证方式。

## 开始开发

1. Fork 并克隆仓库；
2. 在 Windows 10/11 安装 Node.js 22 或更高版本；
3. 运行 `npm ci` 安装锁定依赖；
4. 运行 `npm run check` 验证语法和自动测试；
5. 运行 `npm start` 启动开发版。

```powershell
npm ci
npm run check
npm start
```

## 代码约定

- 主进程、预加载脚本和共享逻辑使用 CommonJS；
- 渲染进程保持无 Node.js 权限，通过 `preload.js` 暴露的最小接口访问系统功能；
- 工作区模式的共享配置统一放在 `src/shared/workspace-modes.js`，不要在界面中复制模式文案；
- 日期和中文快速输入修改应同时补充 `tests/` 中的测试；
- 不要引入账号、遥测或远程数据依赖，除非提案已明确说明隐私和离线行为；
- 不要提交 `node_modules/`、`artifacts/`、`dist-windows/` 或真实用户数据。

## 提交前检查

```powershell
npm run check
npm run dist:portable
```

涉及界面修改时，请检查浅色和深色主题，以及科研、工作、学习三种模式。Pull Request 建议附上无个人信息的前后截图。

## Issue 与 Pull Request

- Bug 报告请包含复现步骤、预期结果、实际结果与 Windows 版本；
- 功能建议请先描述使用场景，再描述方案；
- 数据模型变更必须考虑旧版 `data.json` 的兼容迁移；
- 不要把格式整理、依赖升级和功能修改混在同一个 Pull Request 中。

## 上游 macOS 源码

`Sources/` 与 Swift 配置来自上游 macOS 项目，仅用于保留来源和平台对照。Windows 改动通常应落在 `src/`、`tests/`、`docs/` 和 npm 配置中。需要修改 macOS 版本时，请优先向[上游仓库](https://github.com/roseLuos/YanXu)提交贡献。

## 隐私与安全

Issue、日志和截图可能包含任务、DDL、工作地点或本地路径。提交前请替换为示例数据。安全漏洞不要公开提交 Issue，请按 [SECURITY.md](SECURITY.md) 说明私下报告。
