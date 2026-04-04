# 设置界面探索报告

> 生成时间：2026-03-29
> 探索人：spec-explorer
> 目的：为设置界面布局重构 Spec 提供完整信息基础

---

## 检索到的历史经验

经验记忆索引和知识记忆索引均为空，本次为全新探索，无历史经验可参考。

---

## 文件结构

```
src/features/settings/
├── config/
│   ├── codexProviderConfig.ts
│   ├── configOperations.ts
│   ├── configWriteTarget.ts
│   ├── experimentalFeatures.ts     # 实验性功能：multi_agent / steer
│   ├── mcpConfig.ts
│   ├── mcpPresets.ts
│   ├── personalizationConfig.ts
│   └── proxySettings.ts
├── hooks/
│   ├── appPreferenceStorage.ts     # 偏好持久化（localStorage）
│   └── useAppPreferences.ts        # AppPreferences 类型 + Hook
├── model/                          # 外观/字体/代码风格模型
├── sandbox/                        # Windows Sandbox 配置与初始化
├── update/                         # 应用更新状态管理
└── ui/
    ├── SettingsScreen.tsx          # 懒加载入口，组装 props
    ├── SettingsView.tsx            # 主视图：侧边栏导航 + 内容区路由
    ├── SettingsStaticSections.tsx  # 静态内容：Environment / Worktree / Placeholder
    ├── AboutSettingsSection.tsx
    ├── AgentsSettingsSection.tsx
    ├── AppearanceSettingsSection.tsx
    ├── AppearanceColorControl.tsx
    ├── AppUpdateCard.tsx
    ├── ArchivedThreadsSettingsSection.tsx
    ├── CodeStylePreview.tsx
    ├── CodeStyleSelect.tsx
    ├── CodexAuthModeCard.tsx
    ├── CodexProviderDeleteDialog.tsx
    ├── CodexProviderDialog.tsx
    ├── CodexProviderListCard.tsx
    ├── ComposerPermissionDefaultsCard.tsx  # 权限默认值（渲染在 config 页末）
    ├── ConfigSettingsSection.tsx
    ├── DisplaySettingsCard.tsx     # ⚠️ 孤立文件：未被任何组件引用
    ├── GeneralSettingsSection.tsx
    ├── GitSettingsSection.tsx
    ├── PersonalizationSettingsSection.tsx
    ├── ProxySettingsCard.tsx
    ├── SettingsSelectRow.tsx       # 通用下拉选择行
    ├── WindowsSandboxSettingsCard.tsx
    ├── configAuthMode.ts
    └── settingsSelectMenuLayout.ts
```

---

## 设置项完整列表

### 导航菜单（11 个 section，定义于 SettingsView.tsx `NAV_ITEM_DEFINITIONS`）

| 顺序 | key | 图标 | 实现状态 |
|------|-----|------|----------|
| 1 | `general` | ● | 已实现 |
| 2 | `appearance` | ◐ | 已实现 |
| 3 | `config` | ⚙ | 已实现 |
| 4 | `agents` | ◉ | 已实现 |
| 5 | `personalization` | ◌ | 已实现 |
| 6 | `mcp` | ✣ | 已实现 |
| 7 | `git` | ⑂ | 已实现 |
| 8 | `environment` | ◍ | 已实现 |
| 9 | `worktree` | ▣ | **未实现（纯静态 UI）** |
| 10 | `archived` | ▥ | 已实现 |
| 11 | `about` | ⓘ | 已实现 |

### General 页（GeneralSettingsSection.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| agentEnvironment（运行环境）| Select | windowsNative / wsl |
| workspaceOpener（打开工作区方式）| Select | vscode/visualStudio/githubDesktop/explorer/terminal/gitBash |
| embeddedTerminalShell（内嵌终端 Shell）| Select | powerShell/commandPrompt/gitBash |
| embeddedTerminalUtf8（终端 UTF-8）| Toggle | |
| uiLanguage（UI 语言）| Select | |
| threadDetailLevel（会话详情级别）| Select | compact/commands/full |
| followUpQueueMode（后续追问模式）| Select | steerAvailable 控制可选项 |
| composerEnterBehavior（发送键行为）| Select | enter/cmdIfMultiline |

### Config 页（ConfigSettingsSection.tsx + ComposerPermissionDefaultsCard.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| 认证模式（CodexAuthModeCard）| 卡片+动作 | login/chatgpt 切换 |
| Provider 列表（增删改应用）| 列表+弹窗 | |
| 代理（HTTP Proxy / HTTPS Proxy / No Proxy）| 文本输入+Toggle | ProxySettingsCard |
| Windows Sandbox 开关 | Toggle | WindowsSandboxSettingsCard |
| 打开 config.toml | 按钮 | |
| 开源许可证 | 按钮+弹窗（懒加载）| |
| composerDefaultApprovalPolicy | Select | untrusted/on-failure/on-request/never |
| composerDefaultSandboxMode | Select | read-only/workspace-write/danger-full-access |
| composerFullApprovalPolicy | Select | 同上 |
| composerFullSandboxMode | Select | 同上 |


### Appearance 页（AppearanceSettingsSection.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| 主题模式 | 三按钮 chip | light/dark/system |
| 主题预览（ThemePreview）| 静态预览 | |
| 颜色自定义 accent | 颜色选择器 | |
| 颜色自定义 background | 颜色选择器 | |
| 颜色自定义 foreground | 颜色选择器 | |
| UI 字体名称（内嵌 AppearanceGrid）| 文本输入 | |
| 代码字体名称（内嵌 AppearanceGrid）| 文本输入 | |
| 代码风格（CodeStyleSelect）| Select + 预览 | |
| UI 字体大小 | 数字步进 | |
| 代码字体大小 | 数字步进 | |
| 对比度 | 数字步进 | |

### Agents 页（AgentsSettingsSection.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| Multi-Agent 开关 | Toggle | experimentalFeatures 控制可用性 |
| max_threads（1-12）| 数字步进 | |
| max_depth（1-4）| 数字步进 | |
| Agent 列表（增删改）| 列表+内联表单 | |
| Agent 配置编辑（TOML）| textarea | |

### Personalization 页（PersonalizationSettingsSection.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| Personality 风格 | Select | none/friendly/pragmatic，写入 config |
| 全局 Agent 指令（AGENTS.md）| textarea + 保存 | 读写 ~/.codex/AGENTS.md |

### MCP 页（McpSettingsPanel.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| MCP 服务器列表（启用/禁用/编辑/删除）| 列表卡片 | |
| 添加 MCP 服务器 | 按钮+弹窗 | |

### Git 页（GitSettingsSection.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| gitBranchPrefix | 文本输入 | 有实时预览 |
| gitPushForceWithLease | Toggle | |

### Environment 页（SettingsStaticSections.tsx → EnvironmentContent）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| 工作区根目录列表 | 只读列表 | |
| 添加工作区 | 按钮 | 调用系统文件选择器 |

### Worktree 页（SettingsStaticSections.tsx → WorktreeContent）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| autoClean（自动清理）| Toggle（**静态**）| 硬编码 `checked`，无 handler |
| retention（保留数量）| chip（**静态**）| 硬编码值 "15"，无交互 |

### Archived 页（ArchivedThreadsSettingsSection.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| 存档会话列表 | 列表 | 支持刷新和取消存档 |

### About 页（AboutSettingsSection.tsx）

| 设置项 | 类型 | 备注 |
|--------|------|------|
| 应用更新（检查/下载/安装）| 卡片 | AppUpdateCard，含进度条和版本说明 |


---

## 未实现功能识别

### 1. Worktree 页（整页未实现，纯静态占位）

**文件**：`src/features/settings/ui/SettingsStaticSections.tsx`，`WorktreeContent` 组件

**判断依据**：
- 组件无任何 props，无 handler 传入
- autoClean Toggle：`<ToggleControl checked />` 硬编码 `checked={true}`，无 `onClick`
- retention chip：`<span className="settings-chip settings-chip-sm">15</span>` 硬编码数值
- `SettingsView.tsx` 中：`<WorktreeContent />` 不传任何 prop
- 无对应的 Rust 命令或 bridge 接口

### 2. DisplaySettingsCard（孤立未使用组件）

**文件**：`src/features/settings/ui/DisplaySettingsCard.tsx`

**判断依据**：
- 全代码库中只有该文件自身定义了 `DisplaySettingsCard`
- 没有任何其他 `.tsx` 文件 import 或使用它
- 该卡片实现了 UI 字体、代码字体的 family + size 设置，与 AppearanceSettingsSection 中内嵌的字体输入功能重复
- 推测是外观设置重构过程中遗留的废弃组件

### 3. followUpQueueMode（部分依赖实验性功能）

**文件**：`src/features/settings/ui/GeneralSettingsSection.tsx`

**判断依据**：
- `getFollowUpModeNote(t, props.steerAvailable)` 在 `steerAvailable=false` 时显示不同提示
- steer 功能通过 `experimentalFeatures` 控制，非全量开放，部分用户可能看到功能受限提示
- 功能本身已实现，但 steer 选项对部分用户不可用

---

## 当前分组结构

设置界面采用**扁平单层导航**结构，所有 section 在侧边栏平铺展示，无分组/折叠层级。

```
侧边栏（SettingsSidebar）
├── ← 返回应用
└── 导航列表（11 项，无分组）
    ● 通用
    ◐ 外观
    ⚙ 配置
    ◉ Agents
    ◌ 个性化
    ✣ MCP
    ⑂ Git
    ◍ 环境
    ▣ Worktree
    ▥ 存档会话
    ⓘ 关于
```

**潜在问题**：
- 11 个导航项平铺，缺少语义分组，认知负担较高
- Config 页内部包含「认证+Provider+代理+Sandbox+权限」多个性质不同的子模块，页面较长
- Worktree 与 Environment 在概念上相关（均属工作区管理），但位置分离
- About、Archived 等功能性页面与核心设置混在同一层级


---

## 组件依赖关系

```
App.tsx
└── SettingsScreen.tsx          # 懒加载容器，从 AppController / HostBridge 组装 props
    └── SettingsView.tsx         # 主视图，props 透传给各 section
        ├── SettingsSidebar      # 侧边栏导航（内部组件）
        └── SettingsContent      # 内容路由（内部组件）
            ├── GeneralSettingsSection
            │   └── SettingsSelectRow（复用）
            ├── AppearanceSettingsSection
            │   ├── AppearanceColorControl
            │   ├── CodeStyleSelect
            │   └── CodeStylePreview
            ├── ConfigSettingsSection
            │   ├── CodexAuthModeCard
            │   ├── CodexProviderListCard
            │   │   └── CodexProviderDialog（弹窗）
            │   │   └── CodexProviderDeleteDialog（弹窗）
            │   ├── ProxySettingsCard
            │   └── WindowsSandboxSettingsCard
            ├── ComposerPermissionDefaultsCard  # 紧跟 ConfigSettingsSection 渲染
            │   └── SettingsSelectRow（复用）
            ├── AgentsSettingsSection
            ├── PersonalizationSettingsSection
            │   └── SettingsSelectRow（复用）
            ├── McpSettingsPanel（来自 features/mcp/ui/）
            │   └── McpServerDialog（弹窗）
            ├── GitSettingsSection
            ├── EnvironmentContent（来自 SettingsStaticSections）
            ├── WorktreeContent（来自 SettingsStaticSections，静态）
            ├── ArchivedThreadsSettingsSection
            ├── AboutSettingsSection
            │   └── AppUpdateCard
            └── PlaceholderContent（来自 SettingsStaticSections，兜底）
```

**跨域引用**：
- `McpSettingsPanel` 位于 `features/mcp/ui/`，由 SettingsView 直接引用
- `DisplaySettingsCard` 位于 `features/settings/ui/`，但无任何引用（废弃）

---

## 关键类型定义

### AppPreferences（useAppPreferences.ts）

```typescript
export interface AppPreferences {
  agentEnvironment: AgentEnvironment;       // "windowsNative" | "wsl"
  workspaceOpener: WorkspaceOpener;         // vscode/visualStudio/githubDesktop/explorer/terminal/gitBash
  embeddedTerminalShell: EmbeddedTerminalShell; // powerShell/commandPrompt/gitBash
  embeddedTerminalUtf8: boolean;
  themeMode: ThemeMode;                     // "light" | "dark" | "system"
  uiLanguage: UiLanguage;
  threadDetailLevel: ThreadDetailLevel;     // "compact" | "commands" | "full"
  followUpQueueMode: FollowUpMode;
  composerEnterBehavior: ComposerEnterBehavior;
  composerPermissionLevel: ComposerPermissionLevel;
  composerDefaultApprovalPolicy: ComposerApprovalPolicy;
  composerDefaultSandboxMode: SandboxMode;
  composerFullApprovalPolicy: ComposerApprovalPolicy;
  composerFullSandboxMode: SandboxMode;
  uiFontFamily: string;
  uiFontSize: number;
  codeFontFamily: string;
  codeFontSize: number;
  gitBranchPrefix: string;
  gitPushForceWithLease: boolean;
  contrast: number;
  appearanceColors: AppearanceColorScheme;
  codeStyle: CodeStyleId;
}
```

### SettingsSection 类型（SettingsView.tsx）

```typescript
export type SettingsSection =
  | "general" | "appearance" | "config" | "agents"
  | "personalization" | "mcp" | "git" | "environment"
  | "worktree" | "archived" | "about";
```

### 实验性功能（experimentalFeatures.ts）

- `multi_agent`：控制 Agent 多线程功能可用性
- `steer`：控制 followUpQueueMode 的 steer 选项


---

## 重构建议

### 1. 导航分组（最高优先级）

当前 11 项平铺，建议按语义分为 3-4 组：

```
【应用偏好】
  ● 通用      → 运行环境、终端、语言、会话、发送键
  ◐ 外观      → 主题、颜色、字体、代码风格

【AI 与集成】
  ⚙ 配置      → 认证、Provider、代理、Sandbox
  ◉ Agents   → Multi-Agent、线程数、Agent 列表
  ◌ 个性化    → Personality、全局指令
  ✣ MCP      → MCP 服务器管理

【工作区】
  ⑂ Git      → 分支前缀、强制推送
  ◍ 环境      → 工作区根目录
  ▣ Worktree → (待实现)

【系统】
  ▥ 存档会话
  ⓘ 关于
```

### 2. ComposerPermissionDefaultsCard 归属问题

当前该卡片渲染在 `config` section 末尾，但逻辑上属于「通用/默认行为」。
建议：迁移到 `general` section，或单独提取为 `permissions` section。

### 3. Worktree 页需要正式实现

- 需要增加 Rust 命令支持 worktree 自动清理和保留数量配置
- `WorktreeContent` 组件需要从静态 props-less 改为接收实际状态和 handler
- 可与 Environment 页合并为「工作区」大页，或保留独立但补充功能

### 4. DisplaySettingsCard 清理

- `DisplaySettingsCard.tsx` 为废弃孤立文件，建议在重构时一并删除
- 其功能已被 AppearanceSettingsSection 内联实现覆盖

### 5. Config 页拆分建议

当前 Config 页承载内容过多（认证+Provider+代理+Sandbox+权限默认值），滚动较长。
建议拆分：
- `config`：保留认证模式、Provider 管理
- `network`（新）：代理、Sandbox
- `permissions`（新）：ComposerPermissionDefaultsCard 内容

或采用 Config 页内部 Tab 分组，降低重构成本。

### 6. 技术安全边界

- `SettingsSection` 类型和 `NAV_ITEM_DEFINITIONS` 数组需同步修改
- 新增分组时，侧边栏 CSS（`replica-settings-layout.css`）需支持分组标题样式
- 所有 i18n key 涉及 nav 标签的需要在 `src/i18n/` 中同步添加

---

## 对 Spec 创建的建议

- **建议实现范围**：以导航分组 + Worktree 页实现 + DisplaySettingsCard 清理为核心，Config 页可在第二阶段拆分
- **已知风险**：CSS 文件使用 replica 命名，修改时需确认样式文件来源和隔离方式
- **可复用组件**：`SettingsSelectRow`、`SettingsStaticSections` 中的 `SectionHeader`、`ToggleControl` 均已设计为可复用
- **测试优先**：`SettingsView.test.tsx`、`GeneralSettingsSection.test.tsx`、`AgentsSettingsSection.test.tsx` 等已有测试，重构后需回归

