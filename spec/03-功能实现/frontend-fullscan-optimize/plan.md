# 前端全面优化 - 实现计划

**Spec**: frontend-fullscan-optimize
**日期**: 2026-04-03
**execution_mode**: single-agent

---

## 目标

对 Codex App Plus 前端进行系统性优化，提升渲染性能、改善代码架构、提高可维护性。

## 范围限定

本次优化聚焦 **P0 和 P1** 级别的问题，优先解决影响最大且可安全实施的优化项。不涉及：
- 替换自定义 Store（P3，风险高、收益不确定）
- 引入 CSS Modules（P3，改动面广、需全面迁移）
- UI 组件测试补充（P3，工作量大、独立主题）

---

## 任务清单

### 任务 1：HomeView 渲染路径优化

**目标**：减少 HomeScreen → HomeView → HomeSidebar/HomeViewMainContent 渲染链中的无效重渲染。

**修改文件**：
- `src/features/home/ui/HomeView.tsx`
- `src/features/home/ui/homeViewLayout.tsx`
- `src/features/home/ui/HomeScreen.tsx`

**具体改动**：

1.1 **HomeView 包裹 React.memo**
- 在 `HomeView` 导出处添加 `React.memo`
- HomeView 接收 ~90 个 props，memo 可以在 props 引用不变时跳过渲染

1.2 **稳定化 createHomeSidebarProps / createHomeMainContentProps**
- 当前 `createHomeSidebarProps` 和 `createHomeMainContentProps` 是纯函数，每次调用返回新对象
- 改为在 `HomeView` 内部使用 `useMemo` 包裹这两个调用
- 依赖项为各自用到的 props 字段和局部状态

1.3 **useHomeScreenActions 返回值稳定化**
- 当前 `useHomeScreenActions` 虽然内部每个方法都用了 `useCallback`，但返回对象每次都是新引用
- 使用 `useMemo` 包裹返回对象，依赖为各个 callback

**验收标准**：
- 切换侧边栏、打开终端等 UI 操作时，`HomeSidebar` 和 `HomeViewMainContent` 不会因父级无关状态变更而重渲染
- React DevTools Profiler 中可观察到跳过渲染的组件

---

### 任务 2：useComposerCommandPalette 拆分

**目标**：将 539 行的超大 hook 按关注点拆分为可组合的小 hook。

**修改文件**：
- `src/features/composer/hooks/useComposerCommandPalette.ts`（拆分）
- 新建 `src/features/composer/hooks/usePaletteTrigger.ts`
- 新建 `src/features/composer/hooks/usePaletteKeyboard.ts`

**具体改动**：

2.1 **提取 usePaletteTrigger**
- 将触发检测逻辑（trigger key detection、suppression）提取为独立 hook
- 包含：triggerKey、suppressedTriggerKey、position 计算

2.2 **提取 usePaletteKeyboard**
- 将键盘导航逻辑（ArrowUp/Down、Enter、Escape）提取为独立 hook
- 包含：selectedIndex、onKeyDown handler

2.3 **瘦身 useComposerCommandPalette**
- 主 hook 变为组合层，调用 usePaletteTrigger + usePaletteKeyboard + 现有的 mention/skill 逻辑
- 目标行数 < 200 行

**验收标准**：
- 现有功能不变（命令面板触发、导航、选择正常工作）
- 现有测试通过
- 主 hook < 200 行

---

### 任务 3：HomeViewMainContent 拆分

**目标**：将 526 行的大组件按渲染区域拆分。

**修改文件**：
- `src/features/home/ui/HomeViewMainContent.tsx`（瘦身）
- 新建合理的子组件文件

**具体改动**：

3.1 **分析组件结构**
- 先阅读 HomeViewMainContent 代码，识别其内部的逻辑区域
- 确定拆分边界（如：连接状态视图、对话主视图、空状态视图等）

3.2 **按区域提取子组件**
- 将条件渲染的各分支提取为独立组件
- 保持 props 最小化，只传递各子组件实际需要的数据

3.3 **HomeViewMainContent 瘦身**
- 主组件变为路由/分发层
- 目标行数 < 200 行

**验收标准**：
- 现有功能和视觉效果不变
- 主文件 < 200 行

---

### 任务 4：useAppController 拆分

**目标**：将 414 行的中央控制器按职责域拆分。

**修改文件**：
- `src/app/controller/useAppController.ts`（瘦身）
- 新建 `src/app/controller/useConnectionManager.ts`
- 新建 `src/app/controller/useSandboxSetup.ts`

**具体改动**：

4.1 **提取 useConnectionManager**
- 将连接建立、重试、断开逻辑提取为独立 hook
- 包含：connect、retryConnection、disconnect、状态监控

4.2 **提取 useSandboxSetup**
- 将 Windows 沙箱设置逻辑提取为独立 hook
- 包含：沙箱配置读取、设置完成通知处理

4.3 **瘦身 useAppController**
- 主 hook 变为组合层
- 目标行数 < 200 行

**验收标准**：
- 应用启动、连接、重连流程正常
- 现有测试通过

---

### 任务 5：消除跨 feature 直接耦合

**目标**：workspace 对 git 的直接依赖改为通过 shared 层或 props 传递。

**修改文件**：
- `src/features/workspace/ui/WorkspaceGitButton.tsx`
- `src/features/workspace/ui/WorkspaceGitButtonLauncher.tsx`
- `src/features/workspace/ui/WorkspaceDiffSidebarHost.tsx`

**具体改动**：

5.1 **Git 图标移至 shared**
- 将 `GitCommitIcon`, `GitPullIcon`, `GitPushIcon` 从 `git/ui/gitIcons` 复制到 `shared/ui/officialIcons`
- workspace 改为从 shared 导入

5.2 **WorkspaceGitController 类型解耦**
- `WorkspaceDiffSidebarHost` 和 `WorkspaceGitButtonLauncher` 对 `WorkspaceGitController` 的依赖改为 props 接口化
- 定义局部接口替代直接导入 git 内部类型

**验收标准**：
- workspace feature 不再直接 import 自 `../../git/` 路径
- Git 功能正常工作

---

### 任务 6：WorkspaceSidebarSection 拆分

**目标**：将 505 行的侧边栏组件按职责拆分。

**修改文件**：
- `src/features/workspace/ui/WorkspaceSidebarSection.tsx`（瘦身）
- 新建子组件文件

**具体改动**：

6.1 **分析组件结构**
- 阅读代码，识别：工作区列表渲染、DnD 逻辑、右键菜单逻辑

6.2 **提取 DnD 逻辑**
- 将拖拽排序相关的 state 和 handlers 提取为独立 hook

6.3 **提取右键菜单**
- 将 context menu 逻辑提取为独立组件

**验收标准**：
- 拖拽排序、右键菜单功能正常
- 主文件 < 250 行

---

## 执行顺序

```
任务 1（渲染优化） → 任务 2（Composer hook 拆分）
                   → 任务 3（HomeViewMainContent 拆分）
                   → 任务 4（useAppController 拆分）
                   → 任务 5（跨 feature 解耦）
                   → 任务 6（WorkspaceSidebarSection 拆分）
```

任务 1 最先执行（影响面最广、风险最低）。任务 2-6 彼此独立，可按顺序执行。

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| memo 导致 props 不更新 | 功能异常 | 确保 isEqual 语义正确，充分测试 |
| Hook 拆分后闭包引用错误 | 功能异常 | 保持原有测试通过 |
| 跨 feature 解耦后遗漏引用 | 编译失败 | TypeScript 编译检查 |

## 质量门禁

- [ ] `pnpm run typecheck` 通过
- [ ] `pnpm test` 全部通过
- [ ] 无新增 TypeScript errors
