# Codex App Plus

基于 `React + Vite + Tauri` 的 Codex Windows 复刻工程骨架，协议基线锁定在 `26.304.1528`。

## 本地开发

```bash
pnpm install
pnpm run generate:protocol
pnpm run dev:tauri
```

## 关键约束

- 宿主命令层不做静默降级，错误直接上抛并通过 `fatal.error` 事件广播。
- 协议通信走 JSON 行协议（stdio）。
- 数据目录默认独立到 `%LOCALAPPDATA%/CodexAppPlus`。

## 已实现接口

- Tauri commands:
  - `app_server_start`
  - `app_server_stop`
  - `app_server_restart`
  - `rpc_request`
  - `rpc_cancel`
  - `server_request_resolve`
  - `app_open_external`
  - `app_show_notification`
  - `app_show_context_menu`
  - `app_import_official_data`

- Event channels:
  - `connection.changed`
  - `notification.received`
  - `serverRequest.received`
  - `fatal.error`
