# 项目内存管理梳理

## 总览

- 这个项目的“内存管理”重点不在 JS/Rust 堆优化，而在运行时资源生命周期管理。
- 主要管理对象包括：app-server 进程、RPC pending 请求、前端事件订阅、线程运行时、子代理线程树、MCP 状态快照、流式输出缓存。
- 真正做得最完整的是线程/子代理运行时回收；MCP 更偏状态刷新与展示。

## 通用资源管理

- `src-tauri/src/process_manager.rs`
  - 停止或异常退出时会中止 reader/writer/stderr/wait task。
  - 会 fail 掉所有 pending RPC。
  - 会尝试 kill child 并 wait，避免残留 app-server 进程。
- `src-tauri/src/app_server_io.rs`
  - 用 `PendingMap` 跟踪请求响应。
  - 收到 response 后会及时从 pending map 中移除。
- `src/protocol/client.ts`
  - `attach()` 只保留一套有效监听。
  - `detach()` 会清理 Tauri 事件订阅，避免重复 listener。
- `src/app/conversation/frameTextDeltaQueue.ts`
  - 文本增量会按帧合并后再 flush，减少频繁渲染。
- `src/app/conversation/outputDeltaQueue.ts`
  - 命令输出增量会按短周期合并后再 flush。
- `src/state/appReducer.ts`
  - 通知日志最多保留 500 条。
  - banner 最多保留 20 条。

## 子代理

- 协议层已经完整接入子代理状态。
- `src/protocol/generated/v2/CollabAgentTool.ts`
  - 支持 `spawnAgent`、`sendInput`、`resumeAgent`、`wait`、`closeAgent`。
- `src/protocol/generated/v2/CollabAgentStatus.ts`
  - 支持 `pendingInit`、`running`、`completed`、`errored`、`shutdown`、`notFound`。
- `src/app/conversation/conversationTimeline.ts`
  - 时间线会记录 `collabAgentToolCall`。
  - 每条记录里有 `senderThreadId`、`receiverThreadIds`、`agentsStates`。

## 子代理回收机制

- `src/app/threads/threadRuntimeCleanup.ts`
  - 会从协作调用记录里构建线程图。
  - 会按“先子线程、后父线程”的顺序清理子代理树。
  - 单个线程的清理顺序是：
  - `interrupt active turn`
  - `thread/backgroundTerminals/clean`
  - `thread/unsubscribe`
- 清理时会忽略一部分“已关闭/未加载/不存在”类错误，避免重复报错。
- `src/app/threads/threadResourceCleanup.ts`
  - 会自动判断哪些线程可以卸载。
  - 非当前选中线程、非 streaming、没有 pending request、没有等待审批/输入标记、没有 follow-up 队列时，线程可能被自动回收。
  - 已完成或已失败的子代理线程会被纳入自动清理集合。
  - 内部用 `cleanupInFlightIds` 和 `cleanedThreadIds` 防止重复清理。
- `src/app/conversation/useWorkspaceConversation.ts`
  - 主线程主动中断时，会先清掉所有 descendants，再把主线程设回 `notLoaded + needs_resume`。
- `src/components/replica/HomeSidebar.tsx`
  - 删除会话时也会先清 descendants，再删本地 session。

## 子代理相关结论

- 子代理这块不是只做展示，已经做了完整的线程树级运行时回收。
- 这个仓库里最接近“内存/资源管理”的核心工作基本都在这里。

## MCP

- `src/app/controller/useAppController.ts`
  - 启动时会加载 `config/read` 和 `mcpServerStatus/list`。
- `src/app/config/configOperations.ts`
  - 刷新 MCP 数据时会先调用 `config/mcpServer/reload`。
  - 然后重新读取配置和状态列表。
- `src/app/config/mcpConfig.ts`
  - 会把配置快照和运行时状态合并成 `McpConfigView`。
- `src/components/replica/mcp/McpSettingsPanel.tsx`
  - 设置页支持刷新、启停、增删改服务器配置。
  - 配置变更后会走 reload + 全量刷新。

## MCP 状态管理

- `src/protocol/generated/v2/McpServerStatus.ts`
  - MCP 状态由 `name`、`tools`、`resources`、`resourceTemplates`、`authStatus` 组成。
- 前端会把这些状态汇总成：
  - 工具数
  - 资源数
  - 鉴权状态
- 状态缓存有两份：
  - 全局 store 里的 `mcpServerStatuses`
  - `McpSettingsPanel` 内部的本地 `statuses`
- 这两份缓存都是整数组替换，不做增量 diff、TTL 或自动失效。

## MCP 工具调用

- `src/app/controller/appControllerNotifications.ts`
  - MCP tool call 走通用 `item/started` / `item/completed`。
  - 中间进度走 `item/mcpToolCall/progress`。
- `src/app/conversation/conversationState.ts`
  - 进度会追加到 `progressMessages`。
- `src/app/conversation/conversationTimeline.ts`
  - 最终会映射成 `mcpToolCall` 时间线条目。

## MCP 相关限制

- 没看到按 MCP server 粒度的独立 runtime 回收逻辑。
- 当前回收仍然依附在线程级别，主要靠：
  - `thread/backgroundTerminals/clean`
  - `thread/unsubscribe`
- `progressMessages` 没有上限。
- 但 turn 重新同步或 rehydrate 时，旧的 progress 会被新的 item state 覆盖。

## MCP OAuth

- 协议层已经声明了 `mcpServer/oauth/login`。
- 也接了 `mcpServer/oauthLogin/completed` 通知。
- 但仓库里没有看到前端实际发起 `mcpServer/oauth/login` 的调用点。
- 当前行为更像“能显示完成通知”，还不是完整登录流程。

## MCP Elicitation

- 协议层已经声明了 `mcpServer/elicitation/request`。
- `src/protocol/generated/v2/McpServerElicitationRequestParams.ts`
  - 支持 `form` 和 `url` 两种模式。
- `src/app/controller/useAppController.ts`
  - 对带 `threadId` 的 server request，会用 `thread/increment_elicitation` 和 `thread/decrement_elicitation` 暂停线程超时计数。
- 但 `src/app/controller/serverRequests.ts`
  - 没有给 MCP elicitation 单独建类型分支。
- 结果是：
  - 协议上支持
  - 超时暂停上支持
  - 前端交互层没有专门表单/UI
  - 最终更像落成 `unknown/debug` 请求

## 上下文压缩

- `src/app/controller/appControllerNotifications.ts`
  - 已接 `contextCompaction` 和 `thread/compacted` 通知。
- `src/app/conversation/conversationState.ts`
  - 会记录 compact 事件。
- `src/components/replica/HomeAuxiliaryEntry.tsx`
  - 会在 UI 里显示 “Context compacted”。
- `src/app/conversation/conversationContextWindow.ts`
  - 会显示上下文窗口占用和是否配置自动 compact。
- 这里的 compact 动作来自 app-server。
- 前端主要做记录、状态同步和展示，没有自己实现上下文压缩算法。

## 一句话结论

- 子代理：已经做成线程树级资源回收，属于这个项目里最扎实的运行时管理部分。
- MCP：状态刷新和工具调用接得比较完整，但更偏状态管理；OAuth 和 elicitation 还没有完全落到前端交互层，按 server 粒度的独立回收也没看到。
