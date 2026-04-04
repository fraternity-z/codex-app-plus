---
title: Git Worktree 多工作目录能力 MVP 测试计划
type: test-plan
status: 未确认
created: 2026-04-01
plan: "[[plan]]"
tags:
  - spec
  - test-plan
  - git
  - worktree
  - workspace
---

# 测试计划

## 1. 测试目标与范围

基于已确认需求与 `plan.md`，本计划覆盖以下 MVP 范围：

- Rust git 域的 worktree 列表 / 创建 / 删除能力
- TS bridge 的类型与命令映射正确性
- 前端创建 worktree 后加入 workspace roots 并切换
- 设置页 worktree 管理最小界面
- 删除 worktree 与普通 remove root 的语义区分
- 关键边界与回归

不包含：
- worktree 重命名
- upstream rename
- setup script / setup status
- global worktrees folder
- 复杂 parent/main/worktree 模型

## 2. 验收标准（Pass/Fail）

### 2.1 功能验收标准
1. 对 git 仓库路径可成功列出已有 worktree。
2. 创建 worktree 时：
   - branch 已存在可成功创建；
   - branch 不存在可自动创建新分支并创建 worktree。
3. 创建成功后，新 worktree 目录加入 workspace roots，并切换到该 root。
4. 删除 worktree 后，对应 worktree 从 git 列表与 workspace roots 中同步消失。
5. UI 中“删除 worktree”与“从列表移除 root”行为明确区分，不混淆。
6. 非 git 仓库场景下，worktree 能力被正确禁用或返回明确错误。

### 2.2 稳定性与错误处理标准
1. branch 为空时，前端不允许提交创建。
2. 路径冲突、目录占用、git remove 失败等情况会给出明确错误。
3. 任一失败操作不会破坏现有 roots 列表与选中状态。

### 2.3 通过/阻塞判定
- **通过（Go）**：P0 用例全部通过；无 P0/P1 阻塞缺陷。
- **阻塞（Block）**：任一 P0 失败；或出现误删、创建后未切换、roots 状态错乱等主路径问题。

## 3. 测试环境要求

- 系统：Windows 10/11
- Git CLI：本地可用
- 前端：Vitest + jsdom 测试环境
- Rust：`cargo test --manifest-path src-tauri/Cargo.toml`
- 测试仓库：需能构造
  - 普通仓库
  - 已存在 worktree 的仓库
  - 非 git 目录

## 4. 测试数据设计

### 4.1 仓库数据
建议准备 3 类测试仓库：

1. **普通仓库**
   - 当前只有主工作目录
   - 用于测试首次创建 worktree

2. **已有 worktree 仓库**
   - 至少有 1 个附加 worktree
   - 用于测试列表、删除、识别

3. **非 git 目录**
   - 用于测试禁用与错误提示

### 4.2 分支数据
- 已存在分支：`feature/existing-branch`
- 不存在分支：`feature/new-worktree-branch`
- 非法空值：`""`

### 4.3 观测点
- Rust 返回结构
- bridge invoke 命令与参数
- 前端 roots 列表变化
- selectedRootId 变化
- 设置页 worktree 列表显示
- 删除后的 roots 与 worktree 列表一致性

## 5. 测试用例

> 优先级：P0（必须）、P1（高）、P2（中）

| 用例ID | 优先级 | 覆盖项 | 输入动作（可执行步骤） | 期望结果 |
|---|---|---|---|---|
| TC-RUST-001 | P0 | Rust/list | 对 git 仓库执行 worktree 列表查询 | 返回主工作目录与附加 worktree 的正确列表结构 |
| TC-RUST-002 | P0 | Rust/add 已有分支 | 对已有 branch 执行创建 worktree | 成功创建 worktree，不重复创建分支 |
| TC-RUST-003 | P0 | Rust/add 新分支 | 对不存在 branch 执行创建 worktree | 成功创建新分支并创建 worktree |
| TC-RUST-004 | P0 | Rust/remove | 对附加 worktree 执行删除 | worktree 被成功移除，后续列表中不再出现 |
| TC-RUST-005 | P1 | Rust/非仓库 | 对非 git 目录执行 list/add/remove | 返回明确错误或非仓库结果 |
| TC-RUST-006 | P1 | Rust/目录冲突 | 创建到已存在冲突目录 | 返回明确错误，不产生脏状态 |
| TC-BRIDGE-001 | P0 | bridge/list | 调用 `HostBridge.git.listWorktrees` | 正确 invoke 对应 tauri command，返回类型匹配 |
| TC-BRIDGE-002 | P0 | bridge/add | 调用 `HostBridge.git.addWorktree` | 正确传递 repoPath / branchName / name |
| TC-BRIDGE-003 | P0 | bridge/remove | 调用 `HostBridge.git.removeWorktree` | 正确传递 repoPath / worktreePath / force |
| TC-UI-001 | P0 | 创建后接入 roots | 在前端执行创建 worktree | 新目录被加入 roots，并切换为选中 root |
| TC-UI-002 | P0 | 设置页列表 | 打开 Worktree 设置页 | 正确显示当前 repo 的 worktree 列表 |
| TC-UI-003 | P0 | 删除 worktree | 从 UI 删除一个 worktree | 删除成功后 roots 与列表同步更新 |
| TC-UI-004 | P1 | 非仓库禁用 | 当前 root 为非 git 目录时打开 worktree 管理 | 创建/删除入口禁用或显示明确提示 |
| TC-UI-005 | P1 | 空 branch 校验 | 在创建表单提交空 branch | 前端阻止提交并提示 |
| TC-UI-006 | P1 | 失败不污染状态 | 创建或删除失败后检查 roots | roots 不被错误增删，selectedRootId 不错乱 |
| TC-UX-001 | P0 | 删除语义区分 | 分别执行“从列表移除 root”和“删除 worktree” | 两者行为明确不同，前者不删磁盘目录，后者执行 git worktree remove |
| TC-REG-001 | P1 | 现有 root 功能回归 | 创建/删除 worktree 后继续普通 root 切换与移除 | 现有 root 功能正常 |
| TC-REG-002 | P1 | Git 功能回归 | worktree 创建后继续获取 status/branch refs/diff | 现有 git 功能不受影响 |
| TC-REG-003 | P2 | Settings 回归 | 打开其他 settings section | 其他设置内容不受 worktree 页面改造影响 |

## 6. 回归范围

1. `HostBridge.git` 既有接口不受影响：status、diff、branch refs、checkout、delete branch。
2. `useWorkspaceRoots` 既有新增/删除/选择逻辑不受影响。
3. 左侧工作区区块已有会话展开、切换、菜单行为不受影响。
4. 设置页其他 section 不受 WorktreeContent 改造影响。

## 7. 缺陷分级与处理

- S1（阻塞）：误删目录、创建失败导致 roots 错乱、创建成功但无法切换、删除后状态不一致。
- S2（高）：非仓库误显示可操作入口、错误提示缺失、bridge 与 host 参数错配。
- S3���中）：空态/加载态/文案问题，不影响主流程。
- S4（低）：样式轻微偏差。

处理原则：S1/S2 必须修复并通过回归后，测试阶段才可判定通过。

## 8. Test Stage Definition of Done（通过/阻塞准入标准）

### 8.1 通过准入（DoD-Pass）
1. 所有 P0 用例通过。
2. 无未解决的 S1/S2 缺陷。
3. Rust 测试、前端测试覆盖核心主路径：list/add/remove、创建后接入 roots、删除语义区分。
4. 至少完成一次非仓库场景验证。
5. 已形成测试记录与失败修复记录（如有）。

### 8.2 阻塞准入（DoD-Block）
满足任一条件即阻塞：
1. 任一 P0 用例失败。
2. 出现误删或状态错乱类缺陷。
3. 创建成功后未接入 roots 或未切换。
4. 删除语义混淆，导致用户无法区分 remove root 与 remove worktree。

## 9. 覆盖率要求

- 功能覆盖率：list / add / remove / roots 接入 / UI 区分语义 / 非仓库场景 均需有通过记录。
- 自动化覆盖目标：
  - Rust：worktree service/commands 核心路径覆盖
  - 前端：bridge 调用、roots 接入、关键 UI 行为覆盖
  - 目标模块级覆盖率建议 > 80%
