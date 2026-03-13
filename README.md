# Codex App Plus

基于 `React + Vite + Tauri 2` 的 Codex Windows 桌面外壳。

这个仓库当前聚焦于把官方 `codex app-server` / `codex CLI` 的协议能力接到本地桌面应用里，并补齐工作区、会话、设置、Git、终端与宿主集成体验。

## 当前能力

- **工作区与线程**
  - 添加、切换、移除多个工作区
  - 新建线程、切换线程、恢复本地 Codex 会话
  - 已归档线程视图与本地会话删除
- **对话与 Composer**
  - 发送 turn、打断响应、跟进队列
  - 模型 / effort / service tier 选择
  - 权限级别切换（默认 / 全权限）
  - 上下文窗口指示、附件、斜杠命令、计划抽屉
  - 实验性 multi-agent 能力识别与开关（取决于协议与配置）
- **设置与配置**
  - 常规、配置、个性化、MCP 服务、Git、环境、工作树、已归档线程页面
  - 打开 `config.toml`
  - 读写全局 Agent 指令
  - Codex provider 的列出 / 新增 / 更新 / 删除 / 应用
  - Windows Sandbox 配置读取与 setup 流程
- **桌面集成**
  - 外部链接打开与工作区目录打开
  - 系统通知与上下文菜单
  - 官方数据导入
  - ChatGPT 登录与 token 读写辅助
- **开发辅助**
  - 内嵌终端 session 创建、写入、缩放、关闭
  - Git 状态、diff、stage、unstage、discard、commit、fetch、pull、push、checkout、init
  - 会话时间线、服务端请求响应、fatal error 事件透传

## 技术栈

- **前端**：React 18、TypeScript、Vite、Vitest
- **桌面宿主**：Tauri 2、Rust、portable-pty
- **富文本与终端**：react-markdown、remark-gfm、highlight.js、xterm
- **协议层**：基于官方 `codex app-server` 生成的 TypeScript 类型与 JSON Schema

## 目录结构

```text
.
├─ src/                     前端入口、状态管理、Bridge、协议适配
│  ├─ app/                  应用入口与全局 controller 编排
│  ├─ bridge/               Tauri Host Bridge 类型与实现
│  ├─ features/             按功能域组织的前端代码
│  │  ├─ auth/              登录与鉴权界面
│  │  ├─ composer/          Composer 交互、命令与发送逻辑
│  │  ├─ conversation/      会话状态、时间线、消息渲染
│  │  ├─ git/               工作区 Git 面板与 diff 视图
│  │  ├─ home/              首页壳层、主布局、侧栏
│  │  ├─ mcp/               MCP 设置与表单模型
│  │  ├─ settings/          配置、偏好与 Sandbox 设置
│  │  ├─ terminal/          内嵌终端运行时与组件
│  │  ├─ workspace/         工作区、线程目录与切换
│  │  └─ shared/            跨功能域共享 UI / hooks
│  ├─ protocol/             协议客户端、生成产物、Schema、测试
│  └─ assets/               官方资源与第三方许可证清单
├─ src-tauri/               Rust 宿主、命令、事件、Git/终端实现
├─ scripts/                 协议与许可证生成脚本
└─ README.md
```

## 环境准备

- Windows 开发环境
- Node.js 与 `pnpm`
- Rust toolchain 与 Tauri 2 所需依赖
- 可执行的官方 `codex` CLI（仅在重新生成协议时需要）

仓库已经提交协议生成产物，日常开发通常可以直接启动；只有在升级 `codex` CLI 或需要重新对齐协议时，才需要执行协议生成脚本。

## 快速启动

```powershell
pnpm install
pnpm run dev:tauri
```

如果只想跑前端界面：

```powershell
pnpm run dev
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm run dev` | 启动 Vite 前端开发服务器 |
| `pnpm run dev:tauri` | 启动 Tauri 桌面应用开发模式 |
| `pnpm run build` | 执行 TypeScript 检查并构建前端产物 |
| `pnpm run build:tauri` | 构建前端后打包 Tauri 应用 |
| `pnpm run typecheck` | 运行 TypeScript 类型检查 |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm run generate:protocol` | 重新生成协议 TypeScript 类型与 JSON Schema |
| `pnpm run generate:licenses` | 重新生成 `src/assets/third-party-licenses.json` |

## 协议生成

`scripts/generate-protocol.mjs` 会调用官方 `codex` CLI，重新生成以下目录：

- `src/protocol/generated`
- `src/protocol/schema`

执行方式：

```powershell
pnpm run generate:protocol
```

脚本会优先读取 `CODEX_BINARY_PATH`；如果未设置，则自动从 `PATH` 中查找官方 `codex` CLI，例如：`codex`、`codex.cmd`、`codex.exe`、`codex.ps1`。

如果本机 `codex` 没有加入 `PATH`，再显式指定可执行文件路径：

```powershell
$env:CODEX_BINARY_PATH = "C:\path\to\codex.cmd"
pnpm run generate:protocol
```

## 宿主层约定

- 前后端通信建立在官方 app-server 协议之上
- Host 层通过 Tauri command 暴露桌面能力，通过事件向前端推送状态变更
- 宿主命令层不做静默降级，失败会显式抛出并通过 `fatal-error` 等事件暴露
- 本地数据目录默认位于 `%LOCALAPPDATA%\CodexAppPlus`

## 当前 Tauri 命令面

- **App Server 生命周期**
  - `app_server_start`
  - `app_server_stop`
  - `app_server_restart`
- **RPC / Server Request**
  - `rpc_request`
  - `rpc_notify`
  - `rpc_cancel`
  - `server_request_resolve`
- **应用与配置**
  - `app_open_external`
  - `app_open_workspace`
  - `app_open_codex_config_toml`
  - `app_read_global_agent_instructions`
  - `app_write_global_agent_instructions`
  - `app_list_codex_providers`
  - `app_upsert_codex_provider`
  - `app_delete_codex_provider`
  - `app_apply_codex_provider`
  - `app_read_chatgpt_auth_tokens`
  - `app_write_chatgpt_auth_tokens`
  - `app_show_notification`
  - `app_show_context_menu`
  - `app_import_official_data`
  - `app_list_codex_sessions`
  - `app_read_codex_session`
  - `app_delete_codex_session`
- **Git**
  - `git_get_status`
  - `git_get_diff`
  - `git_init_repository`
  - `git_stage_paths`
  - `git_unstage_paths`
  - `git_discard_paths`
  - `git_commit`
  - `git_fetch`
  - `git_pull`
  - `git_push`
  - `git_checkout`
- **Terminal**
  - `terminal_create_session`
  - `terminal_write`
  - `terminal_resize`
  - `terminal_close_session`

## 当前事件通道

- `connection-changed`
- `notification-received`
- `server-request-received`
- `fatal-error`
- `terminal-output`
- `terminal-exit`
- `app-context-menu-requested`
- `app-notification-requested`
