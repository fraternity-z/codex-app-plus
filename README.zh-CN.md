<p align="center">
  <img src="./src/assets/official/app.png" alt="Codex App Plus 图标" width="120" />
</p>

# Codex App Plus

[English](./README.md)

Codex App Plus 是一个 Windows 优先的 Codex 桌面客户端，目标是在尽量复刻
官方 Codex App 使用体验的基础上，增加一些本地增强能力，并优化内存占用。
它启动官方 `codex app-server`，通过生成的协议与其通信，并在本地桌面端呈现
工作区、对话、Git、终端、设置、插件、MCP 工具和 Windows 集成能力。

前端基于 `React + TypeScript + Vite`，宿主端基于 `Tauri 2 + Rust`。

## 项目定位

Codex App Plus 的目标是尽量贴近官方 Codex App 的核心工作流、协议行为和桌面
交互模型，同时在 Windows 本地工程场景下补充一些偏实用的增强：

- 通过更明确的 app-server、MCP、终端和子进程生命周期管理，降低内存压力。
- 补齐长生命周期子进程的清理路径，尤其是 MCP 或终端会话在 UI 不再需要后
  仍可能保留资源的场景。
- Windows 原生宿主能力，包括 Git、PTY 终端、文件打开、通知、代理、WSL 和
  Windows Sandbox 设置。
- 内置 Windows Computer Use 插件注册，以及 Browser Use 相关本地工作流支持。
- 更完整的桌面 UI，覆盖设置、工作区、线程历史、协议追踪、Git diff、
  follow-up 队列和多代理协作。

## 核心功能

- 工作区与线程管理，支持置顶、归档、历史会话和旧会话清理。
- 完整对话工作流，支持模型、推理强度、服务层级、权限配置、计划模式、斜杠
  命令、附件、图片预览、follow-up 排队和多代理控制。
- 基于官方 `codex app-server` 生成的协议类型和 JSON schema。
- MCP 服务状态、工具/资源可见性、插件与技能市场 UI，以及已安装插件管理。
- 内置 Windows Computer Use 插件，在 Windows 原生环境启动时注册为本地
  Codex marketplace。
- Browser Use 集成，包含应用内浏览器后端、打开网站审批、允许/屏蔽域名和
  浏览数据清理。
- 内嵌终端会话，后端使用 `portable-pty`，前端使用 xterm 渲染。
- Git 状态、diff、暂存、提交、分支、推送/拉取/抓取和托管 worktree 操作。
- 外观、语言、字体、代码样式、代理、Git 默认值、全局指令、自定义 agent、
  宠物、通知、应用更新和第三方许可证查看等设置。
- Windows Sandbox 设置流程，以及 Windows 原生/WSL agent 运行环境切换。
- 内置官方 `@openai/codex` npm 分发包，当前对齐 `0.129.0`。

## 架构概览

运行时 React 应用通过 typed host bridge 调用 Tauri 宿主能力；所有 OS 访问和
长生命周期进程由 Rust 侧负责。

- `src/app/`：应用启动、顶层路由和 app controller。
- `src/features/`：conversation、composer、settings、workspace、git、
  terminal、browser、skills、mcp、auth、pets 等功能模块。
- `src/state/`：自定义外部 store 和中心 reducer。
- `src/bridge/`：前端调用 Tauri 命令、订阅宿主事件的类型边界。
- `src/protocol/`：生成的 Codex 协议 client、类型、schema 和 guard。
- `src-tauri/src/`：Rust 宿主模块，包含 app-server 生命周期、RPC、Git、
  终端、内置插件、内置 Codex CLI、浏览器后端、鉴权、配置、代理、通知、
  工作区状态和 Windows 辅助能力。
- `src-tauri/bundled/`：随应用打包的运行时资产，包括 Computer Use、官方
  Codex CLI npm bundle 和 Browser Use 的 Node REPL MCP helper。

## 环境要求

- Windows 10/11。
- Node.js LTS 和 pnpm。
- Rust 工具链，用于 Tauri 开发和构建。
- WebView2 Runtime，当前 Windows 通常已内置。
- 可选：如果希望 agent 在 Linux 发行版中运行，需要安装 WSL。

常规桌面运行会优先使用内置官方 Codex CLI。只有明确需要允许系统 `codex`
回退时，才设置 `CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX=1`。

## 快速开始

安装依赖：

```bash
pnpm install
```

启动完整桌面开发模式：

```bash
pnpm run dev:tauri
```

构建生产安装包：

```bash
pnpm run build:tauri
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm run dev` | 仅启动 Vite 前端 |
| `pnpm run dev:tauri` | 启动完整桌面开发模式 |
| `pnpm run build` | 类型检查并构建前端产物 |
| `pnpm run build:tauri` | 构建生产 Tauri 安装包 |
| `pnpm run typecheck` | 运行 TypeScript 类型检查 |
| `pnpm test` | 运行 Vitest 测试 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 运行 Rust 宿主测试 |
| `pnpm run generate:protocol` | 从 Codex CLI 重新生成协议类型和 schema |
| `pnpm run generate:licenses` | 重新生成第三方许可证资产 |
| `pnpm run sync:codex-cli` | 同步内置官方 `@openai/codex` npm 包 |

## 开发说明

- `package.json` 当前没有独立 lint 脚本；主要验证路径是 typecheck、定向测试
  和构建。
- 协议文件是生成产物。不要手改 `src/protocol/generated` 或
  `src/protocol/schema`，应重新运行生成命令。
- 前端测试使用 Vitest 和 jsdom，测试文件通常与源码同目录。
- Rust 宿主测试位于 `src-tauri/src/**`，通过 Cargo 运行。
- 第三方许可证数据生成到 `src/assets/third-party-licenses.json`，并在应用设置
  中提供查看入口。

## 致谢

Codex App Plus 使用并受益于以下开源项目和插件生态：

- [OpenAI Codex](https://github.com/openai/codex) 与官方 `@openai/codex`
  npm 分发包，提供 app-server 协议和运行时基础。
- [iFurySt/open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use)：
  本项目内置的 Windows Computer Use 运行时和插件打包基于该项目适配而来。
  详情见 `src-tauri/bundled/computer-use-windows/THIRD_PARTY_NOTICES.md`。
- OpenAI Browser Use 插件生态；Codex App Plus 为应用内浏览器工作流补充了本地
  注册和 Node REPL MCP helper。
- [CodexMonitor](https://github.com/Dimillian/CodexMonitor)，为若干桌面工作流
  提供了参考和灵感。
- [Tauri](https://tauri.app/)、React、Vite、TypeScript、xterm、
  portable-pty、Vitest，以及 `package.json`、`pnpm-lock.yaml`、
  `src-tauri/Cargo.lock` 中列出的其他 JavaScript/Rust 依赖。

所有第三方项目仍遵循各自许可证。许可证清单可通过
`pnpm run generate:licenses` 重新生成。
