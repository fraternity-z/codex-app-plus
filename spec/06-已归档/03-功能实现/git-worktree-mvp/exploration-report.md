# Git Worktree 多工作目录能力探索报告

## 背景

本次需求是在当前项目 `e:\code\codex-app-plus` 中新增 **git worktree 多工作目录能力**，参考 `E:\code\CodexMonitor` 的实现思路，首版按 MVP 范围推进：

- 创建 worktree
- 列出已有 worktree
- 删除 worktree
- 创建后接入现有 workspace root 流程并切换到新目录
- 提供最小可用前端入口与管理界面
- 补齐前端与 Rust 测试

明确不纳入首版范围：

- worktree 重命名
- upstream rename
- setup script / setup status
- global worktrees folder
- 复杂 parent/main/worktree 持久化模型

---

## 现状概览

### 1. 当前项目已有基础能力

#### 1.1 工作区根目录模型已存在
当前项目已有本地工作区目录管理能力，核心位于：

- `src/features/workspace/hooks/useWorkspaceRoots.ts`

现状：
- 已维护 `roots` 和 `selectedRootId`
- 已支持 `addRoot` / `removeRoot` / `selectRoot`
- 已通过 localStorage 持久化
- 已存在 `reorderRoots`

结论：**创建成功后的“接入现有 workspace root 并切换”这部分不需要新建体系，直接复用现有 `useWorkspaceRoots` 即可。**

#### 1.2 左侧工作区 UI 已具备扩展点
左侧工作区区块位于：

- `src/features/workspace/ui/WorkspaceSidebarSection.tsx`

现状：
- 已渲染 `roots`
- 已提供 root 级菜单入口
- 已支持工作区选择、展开、会话创建等交互
- 已存在 `onRemoveRoot`

结论：**可在这个区块补充 worktree 创建/删除入口，避免新造独立导航体系。**

#### 1.3 设置页已有 Worktree 页面占位
当前设置页 Worktree 内容位于：

- `src/features/settings/ui/SettingsStaticSections.tsx`

现状：
- `WorktreeContent` 仍是静态占位内容
- 目前展示的是 auto-clean / retention 文案，不接任何真实能力

结论：**这里适合作为 worktree 管理的最小页面入口，但不能直接沿用当前静态内容。**

#### 1.4 Git host bridge 与 Tauri git 命令体系已成熟
关键文件：

- `src/bridge/hostBridgeTypes.ts`
- `src/bridge/tauriHostBridge.ts`
- `src/bridge/gitTypes.ts`
- `src-tauri/src/git/commands.rs`
- `src-tauri/src/git/models.rs`
- `src-tauri/src/main.rs`

现状：
- 现有 git 域已支持 status / branch refs / diff / checkout / delete branch / fetch / pull / push 等
- `HostBridge.git` 是当前前端访问 git 能力的统一入口
- Rust 侧已形成 `commands.rs -> service.rs -> repository.rs/runtime.rs` 的清晰分层

结论：**worktree MVP 最合理的落点是继续挂在 git 域，而不是 app 域或 workspace 根目录域。**

---

## 关键缺口

### 1. bridge 缺口
当前 `HostBridge.git` 中没有任何 worktree 相关接口，缺少：

- worktree 列表
- worktree 创建
- worktree 删除

这意味着前端目前无法发起任何 worktree 生命周期操作。

### 2. Rust host 缺口
当前 `src-tauri/src/git/commands.rs` 中没有任何 `git worktree` 命令暴露。

缺失内容：
- 输入输出模型
- Tauri command
- service 层 worktree 逻辑
- 错误映射

### 3. 前端业务链路缺口
当前前端没有以下能力：

- 根据 repo path 获取 worktree 列表
- 创建 worktree 的表单流程
- 删除 worktree 的确认流程
- 在创建成功后自动加入 workspace roots 并切换
- 区分“普通 root 删除”和“worktree 删除”

### 4. 测试缺口
当前没有 worktree 生命周期相关测试，至少缺：

- Rust service/command 测试
- bridge 类型与命令调用测试
- 前端 hook / UI 测试

---

## 参考项目 CodexMonitor 的可借鉴点

参考实现中，worktree 能力覆盖更完整，关键文件包括：

- `E:/code/CodexMonitor/src-tauri/src/shared/workspaces_core/worktree.rs`
- `E:/code/CodexMonitor/src/features/workspaces/hooks/useWorktreeOps.ts`

### 可直接借鉴的点

#### 1. 创建逻辑
CodexMonitor 的核心创建逻辑包括：
- 校验 branch
- 计算安全 worktree 路径
- 已有分支时直接 `git worktree add <path> <branch>`
- 分支不存在时用 `git worktree add -b <branch> <path>`

这套逻辑适合当前项目 MVP 直接借鉴。

#### 2. worktree 路径命名策略
CodexMonitor 有专门的 worktree 名称清洗与唯一路径生成逻辑。当前项目首版无需完整移植其全局 worktree 存储策略，但仍建议借用以下思想：

- 从 branch/name 生成安全目录名
- 确保目标目录不冲突
- 删除时识别缺失 worktree 错误并给出明确提示

#### 3. 前端操作链路
CodexMonitor 前端的 `useWorktreeOps.ts` 说明了一个清晰模式：

- 前端通过 service 调用 host
- 创建成功后立刻更新前端工作区列表
- 可按需激活到新 workspace

这与当前项目的 `useWorkspaceRoots` 十分契合。

### 不建议首版直接照搬的点

以下内容与当前项目架构差异较大，不建议在 MVP 一次性迁入：

- `WorkspaceKind` / `parentId` / `worktreeInfo` 这一整套工作区持久化模型
- setup script / setup marker
- global worktrees folder
- rename / rename upstream
- CodexMonitor 的 session/workspace 生命周期管理

原因：当前项目已有自己的 workspace roots 模型，MVP 可以先把 worktree 视为“一个可被打开和管理的目录 root”，避免过早引入复杂层级关系。

---

## 架构集成建议

## 方案原则

### 原则 1：worktree 属于 git 域能力
新增接口应挂在：
- `HostBridge.git`
- `src/bridge/gitTypes.ts`
- `src-tauri/src/git/*`

原因：
- 本质是 `git worktree` 命令封装
- 现有 git repository 解析、错误处理、命令风格都可复用
- 避免把 git 专属能力混入 `app.*`

### 原则 2：前端接入复用现有 workspace roots
创建成功后：
1. 调用 worktree 创建接口
2. 拿到新 worktree 路径
3. 调用现有 `addRoot`
4. 调用现有 `selectRoot`

这样可以在不引入新 workspace model 的前提下完成首版闭环。

### 原则 3：最小 UI 入口优先放在现有工作区与设置页
建议首版提供两个入口：

1. **工作区侧边栏 root 菜单**
   - 对当前 root 提供“创建 worktree”
   - 对识别为 worktree 的 root 提供“删除 worktree”

2. **设置页 WorktreeContent**
   - 展示当前选中/当前工作区关联 repo 的 worktree 列表
   - 提供最小管理入口

这样用户既能从常用路径操作，也有集中管理视图。

---

## MVP 建议范围

## MVP-1：最小闭环

### Rust / bridge
新增 3 个核心能力：

1. `listWorktrees(repoPath)`
2. `addWorktree(repoPath, branch, name?)`
3. `removeWorktree(repoPath, worktreePath, force?)`

建议新增输出结构至少包含：
- `path`
- `branch`
- `head`
- `isCurrent`
- `isLocked`（如易于获取）
- `isPrunable`（可选，首版可不做）

### 前端
首版前端闭环：

1. 在工作区 root 菜单添加“创建 worktree”
2. 创建成功后自动 `addRoot + selectRoot`
3. 在 Worktree 设置页显示列表
4. 对列表项支持“打开/切换到该目录”与“删除 worktree”

### 数据识别
首版不增加新的持久化 schema，只做轻量识别：

- worktree 列表来自 git host 实时查询
- workspace roots 仍按现有 `WorkspaceRoot` 保存
- 是否为 worktree 通过查询结果与 root.path 比对判断

### 删除行为
建议首版严格区分：

- `removeRoot`：只从本地 workspace roots 移除收藏
- `removeWorktree`：执行真实 `git worktree remove`

UI 上必须明确文案，避免误删。

---

## 关键文件落点

### 当前项目

#### 前端
- `src/bridge/gitTypes.ts`
  - 新增 worktree 输入输出类型
- `src/bridge/hostBridgeTypes.ts`
  - 在 `HostBridge.git` 增加 worktree API
- `src/bridge/tauriHostBridge.ts`
  - 增加 invoke 映射
- `src/features/workspace/hooks/useWorkspaceRoots.ts`
  - 复用 `addRoot/selectRoot/removeRoot`，必要时补充辅助逻辑
- `src/features/workspace/ui/WorkspaceSidebarSection.tsx`
  - 增加 worktree 创建/删除入口
- `src/features/settings/ui/SettingsStaticSections.tsx`
  - 把 `WorktreeContent` 从静态占位改为真实管理内容

#### Rust
- `src-tauri/src/git/models.rs`
  - 新增 worktree 输入输出模型
- `src-tauri/src/git/commands.rs`
  - 新增 tauri commands
- `src-tauri/src/git/service.rs`
  - 新增 list/add/remove 逻辑
- `src-tauri/src/main.rs`
  - 注册命令

### 参考项目
- `E:/code/CodexMonitor/src-tauri/src/shared/workspaces_core/worktree.rs`
  - 参考 add/remove 核心逻辑
- `E:/code/CodexMonitor/src/features/workspaces/hooks/useWorktreeOps.ts`
  - 参考前端操作链路

---

## 风险分析

### 1. 删除语义风险
当前项目已有 `removeRoot`，如果 UI 文案不清晰，用户可能误以为“删除列表项”就是“删除磁盘上的 worktree”。

应对：
- 在 worktree 删除入口使用明确文案，例如“删除 worktree（会删除该工作目录）”
- 与“从列表移除”严格分开

### 2. 当前 root 不是 git 仓库的情况
有些 workspace root 可能并非 git repo。

应对：
- `list/add/remove` 前先走现有 repo 解析逻辑
- 非仓库时给出明确提示，并在 UI 上禁用相关入口

### 3. 新建分支与已存在分支分支策略
创建 worktree 时，目标 branch 可能已存在，也可能不存在。

应对：
- 直接借鉴 CodexMonitor 的双路径策略
- 保持与 git CLI 语义一致

### 4. Windows 路径与目录占用问题
项目运行在 Windows，worktree 目录删除可能受文件锁/终端占用影响。

应对：
- 首版不做强制清理增强能力
- 错误文案要说明可能被占用

---

## 结论

当前仓库已经具备 worktree MVP 的一半基础：
- 有 workspace root 管理
- 有成熟 git bridge / tauri 分层
- 有设置页与侧边栏入口可承载 UI

真正缺的是 **git worktree 生命周期命令封装 + 前端最小业务闭环**。

因此，最合理的实施路线是：

1. 在 Rust git 域补齐 `list/add/remove worktree`
2. 在 bridge 中暴露同名接口
3. 在前端工作区菜单与设置页接入最小管理流程
4. 创建成功后复用 `useWorkspaceRoots` 把 worktree 当作新的 workspace root 加入并切换
5. 用测试覆盖 host、bridge 和前端闭环

这个方案与当前架构最贴合，能尽量少改模型地完成首版目标，也为后续二期扩展（重命名、setup script、parent/main/worktree 模型）保留空间。
