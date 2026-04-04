---
title: 设置界面布局优化与未实现功能标记
type: refactor
status: draft
date: 2026-03-29
---

# Plan: 设置界面布局优化与未实现功能标记

## 概述

### 背景

当前设置界面的 11 个导航项完全平铺，无任何分组结构，用户难以快速定位目标设置。
Worktree 页整页为静态占位内容，无实际功能，但外观与其他已实现页面无差异，容易造成误导。
`ComposerPermissionDefaultsCard` 渲染在 `SettingsView` 的 `config` 分支内，概念上不属于配置（Provider/认证/代理）分类。
`DisplaySettingsCard.tsx` 是无任何引用的孤立废弃文件。

### 目标

在不改变任何现有功能的前提下：
1. 为侧边栏导航添加 7 个逻辑分组标题，提升可读性
2. 对 Worktree 导航项标记灰显 + 不可交互 + "Coming Soon" 徽章
3. 将 `ComposerPermissionDefaultsCard` 的渲染位置从 `config` 分支迁移至 `general` 分支
4. 删除废弃孤立文件 `DisplaySettingsCard.tsx`

### 范围

**在范围内**：
- `SettingsView.tsx` — 侧边栏分组渲染、Worktree 项标记、ComposerPermissionDefaultsCard 迁移
- `replica-settings.css` — 添加分组标题和 Coming Soon 样式
- 删除 `DisplaySettingsCard.tsx`

**不在范围内**：
- 不修改任何组件的功能逻辑
- 不实现 Worktree 页的实际功能
- 不新增路由或 section 类型
- 不修改 Rust 后端代码
- 不重构状态管理
- 不修改任何测试文件（除非因文件删除引发编译错误）

---

## 需求分析

### 分组结构

基于用户反馈，从原 4 分组扩展为 7 个更细化的分组，覆盖现有 11 个 section：

```
【界面】          i18n key: settings.nav.group.interface
  ● general      → 通用
  ◐ appearance   → 外观

【认证与模型】    i18n key: settings.nav.group.auth
  ⚙ config       → 配置

【AI 功能】       i18n key: settings.nav.group.ai
  ◉ agents       → Agent
  ◌ personalization → 个性化

【集成】          i18n key: settings.nav.group.integrations
  ✣ mcp          → MCP

【版本控制】      i18n key: settings.nav.group.vcs
  ⑂ git          → Git

【工作区环境】    i18n key: settings.nav.group.workspace
  ◍ environment  → 环境
  ▣ worktree     → Worktree  ← Coming Soon

【系统】          i18n key: settings.nav.group.system
  ▥ archived     → 存档会话
  ⓘ about        → 关于
```

### ComposerPermissionDefaultsCard 实际位置

经代码确认，该卡片目前在 `SettingsView.tsx` 的 `SettingsContent` 函数内、`config` 分支中渲染（第 198 行），
并非在 `ConfigSettingsSection.tsx` 内部。迁移只需修改 `SettingsView.tsx` 中的条件渲染逻辑。

### 导航渲染方式

当前 `SettingsSidebar` 使用 `NAV_ITEM_DEFINITIONS.map(...)` 统一渲染所有导航项。
插入分组标题需要将此 map 改为手写 JSX（或在数据结构中加入分组元数据）。
选择**手写 JSX** 方案：更直观，无需改动类型定义，分组逻辑一目了然。

---

## 设计方案

### 侧边栏分组实现

将 `SettingsSidebar` 中的 `{props.navItems.map(...)}` 替换为手写分组 JSX：

```tsx
<nav className="settings-nav">
  <div className="settings-nav-group-label">{t("settings.nav.group.interface")}</div>
  {/* general, appearance */}
  <div className="settings-nav-group-label">{t("settings.nav.group.auth")}</div>
  {/* config */}
  <div className="settings-nav-group-label">{t("settings.nav.group.ai")}</div>
  {/* agents, personalization */}
  <div className="settings-nav-group-label">{t("settings.nav.group.integrations")}</div>
  {/* mcp */}
  <div className="settings-nav-group-label">{t("settings.nav.group.vcs")}</div>
  {/* git */}
  <div className="settings-nav-group-label">{t("settings.nav.group.workspace")}</div>
  {/* environment, worktree (Coming Soon) */}
  <div className="settings-nav-group-label">{t("settings.nav.group.system")}</div>
  {/* archived, about */}
</nav>
```

### Coming Soon 标记

Worktree 导航项附加 CSS 类 `settings-nav-item--coming-soon`，
并在 label 之后插入 `<span className="settings-nav-coming-soon-badge">Coming Soon</span>`。
`pointer-events: none` + `opacity` 阻止交互，无需修改事件处理逻辑。

### i18n 分组标签

7 个分组标题均需要 i18n key，不硬编码字符串。需在 `src/i18n/` 下的消息文件中添加对应条目。
分组标签仅为 UI 辅助文字，不影响任何功能路径。
`MessageKey` 类型从 `zh-CN.ts` 自动推导，新增 key 须同步在 `zh-CN.ts` 和 `en-US.ts` 中添加，`schema.ts` 无需改动。

---

## 实现步骤

### Step 1: 删除废弃文件

**文件**：`src/features/settings/ui/DisplaySettingsCard.tsx`

**操作**：
```bash
rm src/features/settings/ui/DisplaySettingsCard.tsx
```

**前置确认**：全局搜索 `DisplaySettingsCard` 确认无任何 import 引用。

**验收**：
- 文件不存在
- `pnpm run typecheck` 无新增错误

---

### Step 2: 添加 CSS 样式

**文件**：`src/styles/replica/replica-settings.css`

**操作**：在文件末尾追加以下规则（不改动已有规则）：

```css
/* 导航分组标题 */
.settings-nav-group-label {
  padding: 14px 10px 4px 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-subtle);
  user-select: none;
  pointer-events: none;
}

.settings-nav-group-label:first-child {
  padding-top: 6px;
}

/* Coming Soon 导航项：灰显 + 禁用交互 */
.settings-nav-item--coming-soon {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

/* Coming Soon 徽章 */
.settings-nav-coming-soon-badge {
  margin-left: auto;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-subtle);
  background: var(--surface-hover);
  border-radius: 4px;
  padding: 2px 5px;
  line-height: 1.5;
  white-space: nowrap;
  flex-shrink: 0;
}
```

**说明**：使用项目已有 CSS 变量 `--text-subtle`、`--surface-hover`，无需新增变量。

**验收**：样式文件可正常编译，无语法错误。

---

### Step 3: 添加 i18n 分组标签 key

**涉及文件**：
- `src/i18n/messages/zh-CN.ts` — 中文消息（`MessageKey` 类型从此文件推导，**必须先改此文件**）
- `src/i18n/messages/en-US.ts` — 英文消息（同步添加，保持双语一致）

**操作**：在两个文件的 `settings.nav` 对象内新增 `group` 子对象，包含 7 个分组 key：

```ts
// zh-CN.ts
group: {
  interface:    "界面",
  auth:         "认证与模型",
  ai:           "AI 功能",
  integrations: "集成",
  vcs:          "版本控制",
  workspace:    "工作区环境",
  system:       "系统",
},

// en-US.ts
group: {
  interface:    "Interface",
  auth:         "Auth & Models",
  ai:           "AI Features",
  integrations: "Integrations",
  vcs:          "Version Control",
  workspace:    "Workspace & Environment",
  system:       "System",
},
```

**注意**：`schema.ts` 无需修改，它从 `zh-CN` 自动推导类型树。

**验收**：`pnpm run typecheck` 中 `MessageKey` 类型包含上述 7 个新 key（如 `settings.nav.group.interface`），无 TS 错误。

---

### Step 4: 改造 SettingsSidebar 渲染逻辑

**文件**：`src/features/settings/ui/SettingsView.tsx`

**操作**：将 `SettingsSidebar` 组件中的 `props.navItems.map(...)` 替换为手写分组 JSX。

**变更要点**：
- 保留 `NavItem` 接口和 `NAV_ITEM_DEFINITIONS` 数组不变（仍用于 `sectionTitle` 查找）
- `SettingsSidebar` 不再使用 `navItems` prop 渲染，改为直接使用 `props.onSelectSection` 和 `props.section`
- 导航项 button 的 className 逻辑不变：active 项追加 `settings-nav-item-active`
- Worktree 项：追加 `settings-nav-item--coming-soon`，移除 `onClick`，内部追加 badge span
- 4 个分组标题使用 `<div className="settings-nav-group-label">{t(...)}</div>`

**结构示意**（伪代码）：
```tsx
function renderNavItem(key, icon, labelKey, extra?) {
  const isActive = props.section === key;
  return (
    <button
      key={key}
      type="button"
      className={`settings-nav-item${isActive ? " settings-nav-item-active" : ""}${extra?.comingSoon ? " settings-nav-item--coming-soon" : ""}`}
      onClick={extra?.comingSoon ? undefined : () => props.onSelectSection(key)}
    >
      <span className="settings-nav-icon">{icon}</span>
      <span>{t(labelKey)}</span>
      {extra?.comingSoon && <span className="settings-nav-coming-soon-badge">Coming Soon</span>}
    </button>
  );
}
```

**注意**：`SettingsSidebar` 的 props 类型中 `navItems` 参数仍可保留（供外部 `sectionTitle` 查找），
但侧边栏渲染不再依赖它，或可将其从 props 中移除（需同步更新调用处）。
更稳妥方案：保留 `navItems` prop，仅修改渲染逻辑，不改 props 类型。

**验收**：
- 侧边栏出现 4 个分组标题
- Worktree 项灰显，鼠标悬停保持禁用态，显示 "Coming Soon" 徽章
- 其余 10 个导航项点击行为与之前完全一致
- `pnpm run typecheck` 无错误

---

### Step 5: 迁移 ComposerPermissionDefaultsCard

**文件**：`src/features/settings/ui/SettingsView.tsx`

**操作**：在 `SettingsContent` 函数中：
1. 将 `config` 分支中的 `<ComposerPermissionDefaultsCard preferences={props.preferences} />` 移除
2. 在 `general` 分支中，`<GeneralSettingsSection .../>` 之后追加 `<ComposerPermissionDefaultsCard preferences={props.preferences} />`

**具体改动**：

`general` 分支当前（第 164–166 行）：
```tsx
if (props.section === "general") {
  return <GeneralSettingsSection preferences={props.preferences} steerAvailable={props.steerAvailable} />;
}
```

改为：
```tsx
if (props.section === "general") {
  return (
    <>
      <GeneralSettingsSection preferences={props.preferences} steerAvailable={props.steerAvailable} />
      <ComposerPermissionDefaultsCard preferences={props.preferences} />
    </>
  );
}
```

`config` 分支移除 `ComposerPermissionDefaultsCard` 的渲染（第 198 行），保留 `ConfigSettingsSection` 其他内容。

**注意**：`import { ComposerPermissionDefaultsCard }` 已在文件顶部（第 32 行）存在，无需新增 import。

**验收**：
- General 页底部出现权限默认设置卡片
- Config 页不再显示该卡片
- 卡片功能（读写偏好数据）与迁移前完全一致
- `pnpm run typecheck` 无错误

---

### Step 6: 验证

**命令**：
```bash
pnpm run typecheck
pnpm test
```

**验收标准**：
- TypeScript 编译无新增错误
- 测试套件全部通过
- 手动核查：Settings 界面侧边栏分组正常显示，Worktree 项灰显，General 页有权限卡片，Config 页无权限卡片

---

## 风险和依赖

### 风险

1. **i18n 类型安全**：项目使用强类型 `MessageKey`（从 `zh-CN.ts` 推导），7 个分组 key 必须同时在 `zh-CN.ts` 和 `en-US.ts` 中添加，否则 TypeScript 报错。`zh-CN.ts` 必须先于 `en-US.ts` 修改，`schema.ts` 无需改动。

2. **SettingsSidebar 手写 JSX**：将 map 改为手写 JSX 后，`navItems` prop 若不再被渲染使用，建议保留以降低改动范围，无副作用。

3. **General 页布局**：`ComposerPermissionDefaultsCard` 迁移后需在 general 分支用 Fragment 包裹两个组件。需确认不会引入样式问题。

4. **CSS 变量存在性**：`--text-subtle` 和 `--surface-hover` 已在 `replica-settings.css` 中确认使用，安全。

### 依赖

- 无外部依赖，所有变更均为项目内文件修改
- Step 3（i18n key 新增）必须在 Step 4（SettingsSidebar 改造）之前完成，否则 TypeScript 编译失败
- 其余步骤可独立执行，互不阻塞

---

## 文档关联

- 探索报告：`spec/settings-layout-refactor/exploration-report.md`
- 涉及文件：
  - `src/features/settings/ui/SettingsView.tsx`
  - `src/features/settings/ui/DisplaySettingsCard.tsx`（待删除）
  - `src/styles/replica/replica-settings.css`
  - `src/i18n/messages/zh-CN.ts`（新增 `settings.nav.group.*` 7 个 key，类型推导源）
  - `src/i18n/messages/en-US.ts`（同步新增英文翻译）

---

## execution_mode
single-agent
