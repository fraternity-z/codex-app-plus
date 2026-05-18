# 开发规范

本文档记录 Codex App Plus 当前前后端架构和日常开发约束。实现新功能或修复问题时，先按这里的边界定位代码，再决定改动落点。

## 架构主线

Codex App Plus 是 Windows 优先的 Tauri 桌面应用。前端负责 UI、交互状态和 Codex 协议消费；Rust 宿主负责 OS 访问、长生命周期进程、app-server RPC 转发、Git、终端、文件系统、鉴权和本地配置。

运行链路：

1. `src/main.tsx` 创建 `HostBridge`，挂载 `AppStoreProvider` 和 `App`。
2. `src/app/App.tsx` 组合应用偏好、主题、顶层屏幕路由、工作区根目录、自动化和通知控制器。
3. `src/app/controller/useAppController.ts` 是 app-server 工作流的前端核心：启动或复用 app-server、初始化协议连接、订阅宿主事件、处理通知和 server request、刷新账号状态、管理重试。
4. `src/protocol/client.ts` 只通过 `HostBridge` 访问宿主：RPC request/notify/cancel 走 Tauri command，连接状态、通知、server request 和 fatal error 走 Tauri event。
5. `src/state/store.tsx` 提供自定义外部 store，`src/state/appReducer.ts` 是全局状态转换入口。
6. `src-tauri/src/main.rs` 注册 Tauri plugins、managed state 和 invoke handlers，并在退出时清理 app-server 与终端进程。
7. `src-tauri/src/commands/*` 是薄 Tauri command 层；真实行为放到 `src-tauri/src/domains/*`、`src-tauri/src/git/*` 或 `src-tauri/src/infra/*`。

## 前端分层

- `src/app/`：应用壳、启动流程、顶层 screen 路由、controller 编排和窗口/主题相关 hook。
- `src/app/controller/`：app-server 生命周期、协议初始化、通知映射、server request、账号刷新、重试和 Windows Sandbox setup。
- `src/features/`：按业务域拆分 UI 和逻辑，常见子目录是 `hooks/`、`model/`、`service/`、`ui/`。跨 feature 的状态流应通过 controller、store、bridge 或明确的共享模型连接，不要把全局流程塞进组件。
- `src/state/`：全局 store 和 reducer。新增全局状态时要补齐 action、reducer 和选择器测试。
- `src/domain/`：前端共享领域类型和纯模型。
- `src/bridge/`：前端访问宿主的唯一类型边界。React 代码不应直接散落调用 `invoke` 或 `listen`，应优先扩展 `HostBridge`。
- `src/protocol/`：Codex app-server 协议 client、guard、mapper 和生成类型。`src/protocol/generated` 与 schema 视为生成产物，不手改。
- `src/i18n/`：界面文案和语言基础设施。新增用户可见文案要补齐英文/中文 catalog。
- `src/styles/replica/`：主要 UI 样式。新增样式优先复用现有 class、变量和布局模式。

前端开发规则：

- app-server 相关行为先从 `useAppController`、`ProtocolClient`、`appControllerNotifications.ts` 和 `appReducer.ts` 追踪。
- UI 组件尽量保持展示和局部交互职责；复杂计算放到 `model/` 纯函数，副作用放到 hook 或 service。
- 新增宿主能力时，同步更新 `src/bridge/*Types.ts`、`tauriHostBridge.ts`、Rust input/output model、Tauri command 和 domain/service 测试。
- 协议请求优先使用生成类型和 `ProtocolClient.request()`；不要复制 app-server payload shape。
- 需要持久化到本地或访问 OS 的逻辑属于 Rust 宿主，不放在 React 组件里。

## 后端分层

- `src-tauri/src/main.rs`：应用入口，只负责注册插件、managed state、invoke handler、系统托盘和退出清理。
- `src-tauri/src/commands/`：Tauri command 门面。保持薄层，做输入接收、必要校验和错误转换；阻塞文件/配置操作通过 `run_blocking`。
- `src-tauri/src/domains/`：宿主业务域，包括 `app_server`、`auth`、`browser`、`settings`、`terminal`、`workspace`、`sessions`、`agents`、`dictation`、`app`。
- `src-tauri/src/git/`：Git 专用域，包含 repository、diff、status、stage/unstage/discard、commit/sync、branch 和 worktree。
- `src-tauri/src/infra/`：底层基础设施，包括 process、filesystem、rpc、wsl。业务域可依赖 infra，infra 不应反向依赖业务域。
- `src-tauri/src/models.rs`：仍承载部分跨命令共享 DTO。领域内新增模型优先放到对应 `domains/*/models.rs` 或 `git/models.rs`，只有跨多个命令域复用时再放共享层。
- `src-tauri/src/events.rs`：Rust 到前端的事件名和 payload 发射函数。新增事件要同步 `src/bridge/eventTypes.ts`。
- `src-tauri/bundled/`：打包运行时资产。除非任务明确指向 bundled runtime，否则不要手改。

后端开发规则：

- Tauri command 不承载复杂业务逻辑；把行为放到 domain service 或 git service。
- 长生命周期进程必须有明确 owner 和关闭路径，例如 `ProcessManager`、`TerminalManager`、`ProcessSupervisor`。
- app-server RPC 传输由 `domains/app_server/service.rs`、`infra/rpc/*` 和 `events.rs` 共同维护；不要绕过 pending map 或事件管道直接向前端散发协议消息。
- 文件系统、配置和鉴权写入要通过领域服务集中处理，避免 UI 层拼路径或重复实现持久化规则。
- Windows/WSL 差异通过 `AgentEnvironment` 和 `infra`/domain helper 收敛，不在多个 command 中重复分支。

## 前后端契约

新增或修改前后端能力时，按这个顺序落地：

1. 定义或更新 Rust input/output model，确认 serde 命名与 TypeScript camelCase 类型一致。
2. 在对应 domain/git service 实现行为，并添加 Rust 单元测试。
3. 在 `commands/` 增加薄 Tauri command，并注册到 `main.rs` 的 `generate_handler!`。
4. 更新 `src/bridge/*Types.ts` 和 `src/bridge/tauriHostBridge.ts`。
5. 在 feature hook/service 中调用 `HostBridge`，组件只消费 hook 输出。
6. 补齐 TypeScript 测试，至少覆盖模型、hook 或 reducer 的关键路径。

事件契约需要同步维护：

- Rust 事件名和 payload 在 `src-tauri/src/events.rs`。
- TypeScript 事件类型在 `src/bridge/eventTypes.ts`。
- 订阅一般通过 `HostBridge.subscribe()` 或 `ProtocolClient.attach()`。

## 测试与验证

- 前端类型检查：`pnpm run typecheck`。
- 前端测试：`pnpm run test`，或先运行相关 `*.test.ts(x)`。
- 前端构建：`pnpm run build`。
- Rust 测试：`cargo test --manifest-path src-tauri/Cargo.toml`。
- Tauri 构建：`pnpm run build:tauri`。

优先运行最窄的相关测试；跨 bridge、协议、进程生命周期或共享状态的改动，需要扩大到 typecheck、前端测试和 Rust 测试。

## 生成与同步

- 修改 Codex 协议来源后运行 `pnpm run generate:protocol`，不要手改生成文件。
- 修改第三方依赖许可相关输入后运行 `pnpm run generate:licenses`。
- 同步内置官方 Codex CLI 使用 `pnpm run sync:codex-cli`。
- 当前没有独立 lint 脚本，不要在文档或汇报中声称 lint 已运行。

## 工作区安全

- 工作树可能已有其他人或其他工具的未提交改动。不要回滚或覆盖无关文件。
- 只 stage/commit 当前任务直接产生的文件，使用显式路径，不使用 `git add .`。
- 如果目标文件已有冲突性未提交内容，先停止并说明冲突。
