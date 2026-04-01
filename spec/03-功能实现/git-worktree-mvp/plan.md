---
title: Git Worktree 多工作目录能力 MVP 实施计划
type: plan
category: 03-功能实现
status: 未确认
priority: 高
created: 2026-04-01
execution_mode: single-agent
tags:
  - spec
  - plan
  - git
  - worktree
  - workspace
related:
  - "[[exploration-report|Git Worktree 多工作目录能力探索报告]]"
---

## 1. 概述

### 背景
当前项目已有本地 workspace root 管理、成熟的 Git host bridge 和 Tauri git 命令体系，但尚未提供 git worktree 多工作目录能力。用户希望参考 `E:\code\CodexMonitor` 的实现思路，在当前架构下补齐该能力。

### 目标
1. 支持基于当前仓库列出已有 git worktree。
2. 支持创建 worktree（已有分支 / 新分支两种路径）。
3. 支持删除 worktree。
4. 创建成功后接入现有 workspace root 并自动切换。
5. 提供最小可用前端入口与管理界面。
6. 补齐前端与 Rust 测试。

### 范围
- **包含**：Rust git 域 worktree 命令、TS bridge 类型与调用、侧边栏入口、设置页最小 worktree 管理、创建后加入 roots、相关测试。
- **不包含**：worktree 重命名、upstream rename、setup script/status、global worktrees folder、复杂 parent/main/worktree 持久化模型。

---

## 2. 需求分析

### 已确认需求拆解
1. 功能目标是 **git worktree 多工作目录能力**，不是普通目录收藏。
2. 参考 `CodexMonitor`，可直接借用其核心思路。
3. 首版必须支持：列出 / 创建 / 删除。
4. 创建成功后，需接入当前项目已有 workspace roots 机制并切换过去。
5. 前端需有最小可用入口与管理界面。
6. 按完整 Spec 流程推进，但 `plan.md` 仅描述实现计划，不写测试计划章节。

### 功能性要求
- 基于 repo path 列出该仓库的 worktree。
- 支持输入 branch 创建 worktree。
- branch 已存在时，复用已有分支创建 worktree。
- branch 不存在时，创建新分支并创建 worktree。
- 支持删除指定 worktree。
- 创建成功后，自动将 worktree 目录加入现有 roots 并切换选中。
- UI 必须区分“从列表移除 root”和“真实删除 worktree”。

### 非功能性要求
- 尽量复用现有 git/service/bridge/workspace roots 架构，不引入新模型体系。
- 错误提示清晰，尤其是非仓库、目录冲突、删除失败等场景。
- 不破坏现有 workspace root、侧边栏、settings、git 功能链路。

---

## 3. 设计方案

### 3.1 总体方案
采用“**Rust git 域补齐 worktree 生命周期能力 + 前端复用现有 workspace root 模型**”的实现方式：

1. 在 Rust `git` 模块内新增 `list/add/remove worktree` 能力。
2. 在 TS `gitTypes`、`HostBridge.git`、`tauriHostBridge` 中暴露对应接口。
3. 前端通过 worktree 查询结果驱动最小管理界面。
4. 创建成功后直接调用现有 `addRoot` / `selectRoot` 完成接入与切换。

此方案避免引入新的 `WorkspaceKind` / `parentId` 持久化体系，优先完成 MVP。

### 3.2 架构落点

#### Rust
- `src-tauri/src/git/models.rs`
- `src-tauri/src/git/commands.rs`
- `src-tauri/src/git/service.rs`
- `src-tauri/src/main.rs`

#### Bridge
- `src/bridge/gitTypes.ts`
- `src/bridge/hostBridgeTypes.ts`
- `src/bridge/tauriHostBridge.ts`

#### Frontend
- `src/features/workspace/hooks/useWorkspaceRoots.ts`
- `src/features/workspace/ui/WorkspaceSidebarSection.tsx`
- `src/features/settings/ui/SettingsStaticSections.tsx`
- 视需要补充 worktree 专用 hook / 轻量 dialog 组件（应优先贴近现有结构，避免抽象过度）

### 3.3 数据模型设计

#### Rust / TS 输入输出建议

**列表输入**
- `repoPath`

**创建输入**
- `repoPath`
- `branchName`
- `name?`（可选目录名，未提供时可基于 branch 推导）

**删除输入**
- `repoPath`
- `worktreePath`
- `force?`（首版可先保留字段但默认不暴露 UI）

**列表输出项**
- `path: string`
- `branch: string | null`
- `head: string | null`
- `isCurrent: boolean`
- `isLocked: boolean`
- `prunable: boolean`（可选，有则保留，无则不强求）

### 3.4 前端交互设计

#### 入口 A：侧边栏工作区 root 菜单
- 在现有 root 菜单中增加“创建 worktree”入口。
- 当当前 root 对应路径可识别为某 repo 下的 worktree 时，可增加“删除 worktree”入口。
- 普通 `removeRoot` 行为继续保留，但不与真实 worktree 删除混淆。

#### 入口 B：设置页 Worktree 管理
- 将 `WorktreeContent` 从静态占位改为真实内容。
- 展示当前选中 root 对应 repo 的 worktree 列表。
- 提供：
  - 创建 worktree
  - 打开/切换到 worktree 目录
  - 删除 worktree

### 3.5 创建与删除策略

#### 创建策略
借鉴 CodexMonitor 的核心分支逻辑：
- 若 branch 已存在：执行 `git worktree add <path> <branch>`
- 若 branch 不存在：执行 `git worktree add -b <branch> <path>`

目录策略：
- 从 branch/name 推导安全目录名。
- 在 repo 附近或项目约定路径下生成唯一目录。
- 首版不引入全局 worktree 根目录配置。

#### 删除策略
- 通过 `git worktree remove <path>` 删除。
- 删除成功后，同步从 workspace roots 中移除对应 path。
- 若删除失败（目录被占用、存在未提交改动等），直接透出明确错误，不在首版增加复杂恢复逻辑。

### 3.6 与现有 roots 的集成方式

创建成功后：
1. host 返回 worktree 信息（至少包含 path）
2. 前端调用 `addRoot({ name, path })`
3. 前端调用 `selectRoot(newRootId)` 或依赖当前 `addRoot` 的自动选中逻辑
4. 设置页和侧边栏通过现有 roots 渲染该目录

删除成功后：
1. host 完成 `git worktree remove`
2. 前端按 path 找到对应 root
3. 调用 `removeRoot(rootId)` 清理本地 roots

### 3.7 错误与边界
- 非 git 仓库：禁用或拒绝 worktree 操作。
- branch 为空：前端禁止提交。
- worktree 目录冲突：host 返回明确错误。
- 当前 worktree 删除失败：如 git 返回错误，直接展示。
- 不允许把“从列表移除”误当成“删除 worktree”。

---

## 4. 执行模式

### 执行模式选择
**推荐模式**：单 Agent（single-agent）

### 选择理由
- 改动虽然跨前后端，但都围绕单一功能域（git worktree）。
- host / bridge / UI / roots 接入之间耦合紧密，串行推进更利于契约一致。
- MVP 范围明确，不需要多 Agent 并行拆分。

---

## 5. 实现步骤（5 阶段流程）

### 阶段 1：Rust git worktree 能力补齐
- 在 `models.rs` 新增 worktree 输入输出模型。
- 在 `service.rs` 增加：
  - list worktrees
  - add worktree
  - remove worktree
- 复用现有 repository 解析与 git 命令执行方式。
- 在 `commands.rs` 暴露 tauri commands。
- 在 `main.rs` 注册命令。

### 阶段 2：TS bridge 与类型契约接入
- 在 `gitTypes.ts` 增加 worktree 类型定义。
- 在 `hostBridgeTypes.ts` 的 `git` 域增加接口。
- 在 `tauriHostBridge.ts` 增加对应 invoke 实现。
- 确保命名与现有 git API 风格一致。

### 阶段 3：前端最小操作链路落地
- 为当前选中 workspace root 增加 worktree 查询与创建/删除动作。
- 在侧边栏 root 菜单增加 worktree 入口。
- 创建成功后复用 `addRoot` / `selectRoot` 接入当前 roots。
- 删除成功后从 roots 中同步移除对应 root。

### 阶段 4：设置页 Worktree 管理页接入
- 将 `WorktreeContent` 改为真实数据视图。
- 展示当前 repo 的 worktree 列表。
- 提供创建与删除入口。
- 提供最小状态反馈：空态、加载态、错误态。

### 阶段 5：测试与收口
- 为 Rust service/commands 增加测试。
- 为前端关键链路增加测试。
- 核对删除语义、创建后切换、非仓库禁用等边界。
- 输出实现总结所需信息。

---

## 6. 风险和依赖

### 主要风险
1. **删除语义风险**：用户误把 root 移除理解为真实删除 worktree。
2. **路径策略风险**：worktree 路径生成若不稳定，可��引发目录冲突。
3. **Windows 删除风险**：目录占用可能导致 `git worktree remove` 失败。
4. **契约一致性风险**：Rust / bridge / 前端字段命名不一致会导致联调返工。

### 风险缓解
- 明确区分 `removeRoot` 与 `removeWorktree` 的 UI 文案与操作入口。
- 目录名生成逻辑参考 CodexMonitor 的安全命名思路。
- 首版保持错误透传，不做隐藏式恢复。
- 先确定类型契约，再进入 UI 接线。

### 关键依赖
- 本地 Git CLI 可用。
- 当前仓库已有 git service 与 invoke 框架可复用。
- 现有 `useWorkspaceRoots` 提供 add/remove/select 能力。

---

## 7. 文档关联

- 探索报告: [[exploration-report|Git Worktree 多工作目录能力探索报告]]
- 实现总结: [[summary|实现总结]] (待创建)
- 测试计划: [[test-plan|测试计划]] (待创建，由 spec-tester 创建)
