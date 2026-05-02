<p align="center">
  <img src="./src/assets/official/app.png" alt="Codex App Plus 图标" width="120" />
</p>

# Codex App Plus

[English](./README.md)

Codex App Plus 是一个增强版的 Windows 桌面 Codex 客户端，基于 `React + TypeScript + Vite + Tauri 2` 构建。

## 相比官方客户端的核心优化

- **优化内存管理**：修复了 MCP 进程生命周期问题导致的内存泄漏，避免子进程无法卸载
- **增强进程监管**：改进子进程管理机制，提升稳定性和资源清理能力
- **额外功能**：参考 [CodexMonitor](https://github.com/Dimillian/CodexMonitor) 集成了部分实用功能

## 核心功能

- 多工作区与线程管理
- 完整对话工作流，支持模型选择、权限配置和斜杠命令
- 全面的设置管理（MCP 服务、Git、环境、provider）
- 内嵌终端会话与 PTY 支持
- Git 操作（暂存、提交、推送、分支管理）
- Windows Sandbox 集成
- 会话时间线与协议流量检查

## 技术栈

- 前端：React 18、TypeScript、Vite
- 桌面：Tauri 2、Rust
- 终端：xterm、portable PTY
- 协议：基于官方 `codex app-server` 生成

## 环境要求

- Windows 操作系统
- Node.js LTS + pnpm
- Rust 工具链
- 官方 `codex` CLI（对齐 v0.128.0）

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动开发模式

```bash
pnpm run dev:tauri
```

### 构建生产版本

```bash
pnpm run build:tauri
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm run dev:tauri` | 启动桌面开发模式 |
| `pnpm run build:tauri` | 构建生产安装包 |
| `pnpm run typecheck` | 运行 TypeScript 类型检查 |
| `pnpm test` | 运行测试套件 |
| `pnpm run generate:protocol` | 从 codex CLI 重新生成协议类型 |

## 致谢

特别感谢 [CodexMonitor](https://github.com/Dimillian/CodexMonitor) 为部分功能提供的灵感。

## 许可证

详见 [LICENSE](./LICENSE)。
