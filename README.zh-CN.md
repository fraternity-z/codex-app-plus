<p align="center">
  <img src="./src/assets/official/app.png" alt="Codex App Plus 图标" width="120" />
</p>

# Codex App Plus

[English](./README.md)

Codex App Plus 是一个面向 Windows 的 Codex 桌面外壳，基于 `React + TypeScript + Vite + Tauri 2` 构建。
项目的目标是把官方 `codex app-server` 与 `codex CLI` 的协议能力接入本地桌面应用，并提供清晰可追踪的状态、显式暴露的错误以及宿主级系统集成。

## 项目功能

- 工作区与线程管理
  - 支持多个工作区的添加、切换与移除
  - 支持新建线程、切换线程、恢复本地 Codex 会话
  - 支持查看已归档线程和删除本地会话
- 对话与 Composer 工作流
  - 支持发送 turn、打断响应、管理 follow-up 队列
  - 支持选择模型、推理强度和 service tier
  - 支持切换权限配置、附加上下文和使用斜杠命令
  - 在协议支持时显示计划抽屉、上下文窗口指示以及实验性 multi-agent 信号
- 设置与配置
  - 覆盖常规偏好、配置、个性化、MCP 服务、Git、环境、worktree、已归档线程等页面
  - 支持打开 `config.toml`
  - 支持读取和写入全局 Agent 指令
  - 支持列出、新增、更新、删除和应用 Codex provider
  - 支持读取 Windows Sandbox 配置并执行 setup 流程
- 桌面与宿主集成
  - 支持打开外部链接与工作区目录
  - 支持系统通知和上下文菜单
  - 支持导入官方应用数据
  - 支持 ChatGPT 登录 token 的读取与写入辅助流程
- 应用内开发辅助
  - 支持创建、缩放、写入和关闭内嵌终端 session
  - 支持查看 Git 状态并执行 stage、unstage、discard、commit、fetch、pull、push、checkout、init
  - 支持透出会话时间线、服务端请求响应流量和宿主 fatal error

## 技术栈

- 前端：React 18、TypeScript、Vite、Vitest
- 桌面宿主：Tauri 2、Rust、portable PTY
- 富文本与终端：`react-markdown`、`remark-gfm`、`highlight.js`、`xterm`
- 协议层：基于官方 `codex app-server` 生成的 TypeScript 类型与 JSON Schema

## 仓库结构

```text
.
├─ src/
│  ├─ app/                  应用启动与 controller 编排
│  ├─ bridge/               Tauri command / event 的类型化桥接层
│  ├─ features/             按功能域拆分的 React 代码
│  ├─ protocol/             协议生成产物、Schema、guard 与测试
│  ├─ state/                全局状态与 reducer
│  └─ assets/               官方资源与生成的许可证数据
├─ src-tauri/               Rust 宿主运行时、命令、事件、Git 与终端逻辑
├─ scripts/                 协议与许可证生成脚本
├─ docs/                    补充文档
├─ README.md                英文主文档
└─ README.zh-CN.md          中文文档
```

## 开发步骤

### 1. 准备环境

完整桌面开发通常需要：

- Windows 环境
- 较新的 Node.js LTS
- `pnpm`
- Rust toolchain 以及 Tauri 2 所需依赖
- 仅在需要重新生成协议产物时才需要官方 `codex` CLI

仓库已经提交协议生成结果，所以日常前端或宿主开发通常不需要本地安装 `codex` 可执行文件。

### 2. 安装依赖

```bash
pnpm install
```

### 3. 启动桌面开发模式

```bash
pnpm run dev:tauri
```

该命令会同时启动 Vite 前端和 Tauri 宿主运行时。

### 4. 仅启动前端界面

```bash
pnpm run dev
```

如果当前只做不依赖宿主命令或事件的 UI 调整，可以使用这个模式。

### 5. 提交前执行校验

```bash
pnpm run typecheck
pnpm test
```

### 6. 构建产物

```bash
pnpm run build
pnpm run build:tauri
```

`build` 会先执行 TypeScript 校验，再构建前端产物。
`build:tauri` 会在前端构建完成后继续打包桌面应用。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm run dev` | 启动 Vite 前端开发服务器 |
| `pnpm run dev:tauri` | 启动 Tauri 桌面开发模式 |
| `pnpm run build` | 执行 TypeScript 校验并构建前端产物 |
| `pnpm run build:tauri` | 构建前端后打包 Tauri 应用 |
| `pnpm run preview` | 本地预览构建后的前端产物 |
| `pnpm run typecheck` | 运行 TypeScript 类型检查 |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm run generate:protocol` | 重新生成协议 TypeScript 类型与 JSON Schema |
| `pnpm run generate:licenses` | 重新生成 `src/assets/third-party-licenses.json` |

## 生成产物

### 协议生成

当上游 Codex 协议发生变化，或你升级了本地 `codex` CLI 后，需要执行：

```bash
pnpm run generate:protocol
```

脚本会优先读取 `CODEX_BINARY_PATH`。如果没有设置该变量，则会从 `PATH` 中查找可执行文件，包括 `codex`、`codex.cmd`、`codex.exe`、`codex.ps1` 等常见名称。

Windows PowerShell 示例：

```powershell
$env:CODEX_BINARY_PATH = "C:\\path\\to\\codex.cmd"
pnpm run generate:protocol
```

该脚本会刷新：

- `src/protocol/generated`
- `src/protocol/schema`

### 许可证数据生成

依赖元数据变化后，可执行以下命令重新生成第三方许可证文件：

```bash
pnpm run generate:licenses
```

## 运行说明

- 项目遵循协议优先设计，前后端通过类型化 bridge 和协议 payload 通信。
- 宿主层失败会显式暴露，不做静默降级。
- 本地应用数据默认存储在 `%LOCALAPPDATA%\\CodexAppPlus`。
