# Windows 开发与构建

## 环境

- Windows 10/11 x64；
- Node.js 22 或更高版本；
- npm 10 或更高版本。

使用锁文件安装依赖：

```powershell
npm ci
```

## 常用命令

```powershell
npm start              # 使用正式用户数据启动
npm run demo           # 使用 artifacts/ 中的隔离示例数据启动
npm run check          # 语法检查与自动测试
npm run capture        # 生成主界面回归截图
npm run capture:settings
npm run capture:records
npm run capture:work
npm run capture:study
```

截图和隔离数据写入 `artifacts/`，不会提交到 Git。

## 生成安装包

```powershell
npm run dist:portable  # 免安装便携版
npm run dist           # NSIS 安装版 + 便携版
```

构建结果位于 `dist-windows/`：

```text
dist-windows/
├── YanXu-Windows-<version>-x64.exe
└── win-unpacked/
```

公开发布前应配置可信的 Windows 代码签名证书。默认本地构建不是面向最终用户的可信发布签名，Windows SmartScreen 可能显示未知发布者提示。

## 隔离测试数据

主进程支持以下环境变量：

| 变量 | 用途 |
| --- | --- |
| `YANXU_DATA_PATH` | 指定独立的 JSON 数据文件 |
| `YANXU_EMPTY_DATA=1` | 使用空工作区启动 |
| `YANXU_CAPTURE` | 启动后截图并退出 |
| `YANXU_PREVIEW_PANEL` | 预览 `settings` 或 `records` 面板 |
| `YANXU_PREVIEW_MODE` | 预览 `research`、`work` 或 `study` 模式 |

不要让测试或截图流程指向正式用户数据。

## 发布检查清单

1. `npm ci` 能从干净环境完成；
2. `npm run check` 全部通过；
3. `npm audit` 无已知漏洞；
4. 三种模式与浅色/深色主题均完成视觉检查；
5. 旧版 `data.json` 和导出备份可正常迁移；
6. `npm run dist` 能同时生成 NSIS 与便携版；
7. 安装、卸载、登录启动和便携版数据路径均已验证；
8. `CHANGELOG.md` 已更新，发布包带有 `LICENSE` 与 `NOTICE.md`。

