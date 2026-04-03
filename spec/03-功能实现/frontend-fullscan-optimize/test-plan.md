# 前端全面优化 - 测试计划

**Spec**: frontend-fullscan-optimize
**日期**: 2026-04-03

---

## 测试策略

本次优化以**重构**为主（拆分组件/hook、添加 memo、稳定化引用），不涉及功能新增。测试策略为：

1. **回归验证**：确保现有测试全部通过
2. **编译检查**：TypeScript 类型检查无新增错误
3. **功能验证**：核心交互路径手动验证

---

## 现有测试基线

涉及修改的模块已有的测试文件：

### Home 模块
- `src/features/home/ui/HomeView.test.tsx`
- `src/features/home/ui/HomeView.interrupt.test.tsx`
- `src/features/home/ui/HomeSidebar.test.tsx`
- `src/features/home/hooks/useWorkspaceSwitchTracker.test.tsx`
- `src/features/home/hooks/useWorkspaceLaunchScripts.test.tsx`
- `src/features/home/model/homeConnectionRetry.test.ts`

### Composer 模块
- `src/features/composer/hooks/useComposerPicker.test.tsx`
- `src/features/composer/hooks/useComposerSelection.test.tsx`
- `src/features/composer/model/composerInputTriggers.test.ts`
- `src/features/composer/model/composerPaletteData.test.ts`
- `src/features/composer/ui/HomeComposer.commands.test.tsx`
- 及其他 ~15 个 composer 测试文件

### Workspace 模块
- `src/features/workspace/ui/WorkspaceSidebarSection.test.tsx`
- `src/features/workspace/ui/WorkspaceGitButton.test.tsx`
- `src/features/workspace/hooks/useWorkspaceRoots.test.tsx`

### App Controller
- `src/app/controller/appControllerNotifications.test.ts`

### State
- `src/state/appReducer.composerPreset.test.ts`
- `src/state/appReducer.workspaceSwitch.test.ts`

---

## 逐任务测试方案

### 任务 1：HomeView 渲染路径优化

| 测试项 | 方法 | 通过标准 |
|--------|------|---------|
| HomeView.test.tsx 回归 | `pnpm test -- src/features/home/ui/HomeView.test.tsx` | 全部通过 |
| HomeView.interrupt.test.tsx 回归 | `pnpm test -- src/features/home/ui/HomeView.interrupt.test.tsx` | 全部通过 |
| HomeSidebar.test.tsx 回归 | `pnpm test -- src/features/home/ui/HomeSidebar.test.tsx` | 全部通过 |
| TypeScript 编译 | `pnpm run typecheck` | 0 errors |

### 任务 2：useComposerCommandPalette 拆分

| 测试项 | 方法 | 通过标准 |
|--------|------|---------|
| 命令面板相关测试回归 | `pnpm test -- src/features/composer/` | 全部通过 |
| 导入路径验证 | grep 检查新模块被正确导入 | 无遗漏 |
| TypeScript 编译 | `pnpm run typecheck` | 0 errors |

### 任务 3：HomeViewMainContent 拆分

| 测试项 | 方法 | 通过标准 |
|--------|------|---------|
| HomeView 全量回归 | `pnpm test -- src/features/home/` | 全部通过 |
| TypeScript 编译 | `pnpm run typecheck` | 0 errors |

### 任务 4：useAppController 拆分

| 测试项 | 方法 | 通过标准 |
|--------|------|---------|
| appControllerNotifications 回归 | `pnpm test -- src/app/controller/` | 全部通过 |
| TypeScript 编译 | `pnpm run typecheck` | 0 errors |

### 任务 5：跨 feature 解耦

| 测试项 | 方法 | 通过标准 |
|--------|------|---------|
| WorkspaceGitButton 回归 | `pnpm test -- src/features/workspace/ui/WorkspaceGitButton.test.tsx` | 全部通过 |
| 导入路径验证 | `grep -r "../../git/" src/features/workspace/` | 无匹配（除测试文件） |
| TypeScript 编译 | `pnpm run typecheck` | 0 errors |

### 任务 6：WorkspaceSidebarSection 拆分

| 测试项 | 方法 | 通过标准 |
|--------|------|---------|
| WorkspaceSidebarSection 回归 | `pnpm test -- src/features/workspace/ui/WorkspaceSidebarSection.test.tsx` | 全部通过 |
| Workspace 全量回归 | `pnpm test -- src/features/workspace/` | 全部通过 |
| TypeScript 编译 | `pnpm run typecheck` | 0 errors |

---

## 全量验证

所有任务完成后执行：

```bash
# 1. TypeScript 编译检查
pnpm run typecheck

# 2. 全量测试
pnpm test

# 3. 生产构建
pnpm run build
```

全部通过即视为测试通过。

---

## 风险测试点

| 风险 | 验证方法 |
|------|---------|
| React.memo 导致 props 更新不触发重渲染 | 现有 HomeView 测试覆盖了交互场景 |
| Hook 拆分后闭包引用错误 | 命令面板系列测试覆盖了完整交互流程 |
| 子组件提取后 props 类型不匹配 | TypeScript 编译检查 |
