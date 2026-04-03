# 前端全面优化 - 探索诊断报告

**日期**: 2026-04-03
**范围**: src/ 全部前端代码 (856 文件, ~37k 行)
**维度**: 性能 / 架构与可维护性 / 代码质量

---

## 一、性能问题

### 1.1 状态管理效率

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `useAppStore()` 订阅整个 AppState，任何 state 变更触发全局重渲染 | `src/state/store.tsx:100` | 🔴 高 |
| `useHomeScreenState` 拉取大片段 state，HomeScreen 是根组件，变更级联整棵树 | `src/features/home/ui/HomeScreen.tsx:41` | 🔴 高 |
| `selectedConversationSelector` 依赖数组含 `store` (稳定引用)，多余依赖 | `src/features/conversation/hooks/useWorkspaceConversation.ts:36` | 🟡 中 |
| `mapActivities` 在每次相关 state 更新时重新计算，计算量大 | `src/features/conversation/hooks/useWorkspaceConversation.ts:78` | 🟡 中 |

### 1.2 组件重渲染

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `HomeView` 未 memo，接收 140+ 行 props 定义，每次 state 变更全量重渲染 | `src/features/home/ui/HomeView.tsx:144` | 🔴 高 |
| `useHomeScreenActions` 每次渲染创建新 `actions` 对象，导致子组件无效重渲染 | `src/features/home/ui/HomeScreen.tsx:106` | 🔴 高 |
| `createHomeSidebarProps` / `createHomeMainContentProps` 每渲染生成新对象+新函数引用，抵消子组件 memo 效果 | `src/features/home/ui/HomeView.tsx:194-205` | 🔴 高 |
| `WorkspaceSidebarSection` 未 memo，含复杂 DnD 状态 | `src/features/workspace/ui/WorkspaceSidebarSection.tsx:308` | 🟡 中 |
| `useWorkspaceConversation` 返回大对象，消费者即使只用一个字段也全量重渲染 | `src/features/conversation/hooks/useWorkspaceConversation.ts` | 🟡 中 |

### 1.3 列表渲染

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `WorkspaceSidebarSection` 无虚拟化，工作区/线程增多时卡顿 | `src/features/workspace/ui/WorkspaceSidebarSection.tsx` | 🟡 中 |
| 主对话列表已用 `@tanstack/react-virtual`（✅ 正面） | `src/features/conversation/ui/HomeConversationCanvas.tsx` | ✅ |

### 1.4 事件处理

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `HomeUserInputPrompt` 输入无 debounce，每次按键触发 state 更新 | `src/features/conversation/ui/HomeUserInputPrompt.tsx` | 🟢 低 |

### 1.5 Bundle 与代码分割

| 问题 | 位置 | 严重度 |
|------|------|--------|
| Settings/Skills/DiffSidebar 已 lazy（✅） | - | ✅ |
| Terminal、Composer 等大模块未 lazy load | `src/features/terminal/`, `src/features/composer/` | 🟡 中 |

---

## 二、架构与可维护性

### 2.1 跨 feature 耦合

| 问题 | 位置 | 严重度 |
|------|------|--------|
| workspace 直接导入 git 内部类型 | `src/features/workspace/ui/WorkspaceDiffSidebarHost.tsx:3`, `WorkspaceGitButtonLauncher.tsx:2` | 🟡 中 |
| workspace 导入 git 的 UI 组件（图标） | `src/features/workspace/ui/WorkspaceGitButton.tsx:2` | 🟡 中 |
| useAppController 直接导入 conversation model、settings sandbox | `src/app/controller/useAppController.ts:6-13` | 🟡 中 |

### 2.2 超大文件（>300 行）

| 文件 | 行数 | 问题 |
|------|------|------|
| `useComposerCommandPalette.ts` | 539 | 混合触发检测/mention/键盘导航/选择逻辑 |
| `HomeViewMainContent.tsx` | 526 | 大量条件渲染 |
| `WorkspaceSidebarSection.tsx` | 505 | 侧边栏+DnD+右键菜单 |
| `useAppController.ts` | 414 | 连接/启动/沙箱/账户/事件 |

### 2.3 自定义 Store 架构

| 问题 | 位置 | 严重度 |
|------|------|--------|
| 手工实现 selector 缓存逻辑（useRef + Object.is），复杂且易出错 | `src/state/store.tsx:64-75` | 🟡 中 |
| Action 类型定义为大型联合类型，随功能增长成为瓶颈 | `src/domain/types.ts` | 🟡 中 |

### 2.4 Bridge 层

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `TauriPayload` 为 `Record<string, unknown>`，丢失类型安全 | `src/bridge/tauriHostBridge.ts:80` | 🟡 中 |

---

## 三、代码质量

### 3.1 React 反模式

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `HomeComposer` 编排过多 hook（附件/选择/命令面板/持久化），职责过重 | `src/features/composer/ui/HomeComposer.tsx:72-197` | 🟡 中 |
| 存在两套 Composer 实现，功能相似但独立实现 | `HomeComposer.tsx` vs `ConversationPane.tsx:157-178` | 🟡 中 |
| `useComposerCommandPalette` 选项对象 22 个字段 | `src/features/composer/hooks/useComposerCommandPalette.ts:57-79` | 🟡 中 |

### 3.2 错误处理

| 问题 | 位置 | 严重度 |
|------|------|--------|
| 异步处理使用 `void` 前缀无 catch | `src/features/conversation/ui/ConversationPane.tsx:111-114` | 🟡 中 |
| 错误仅通过 banner dispatch 报告，无局部 fallback UI | 多处 | 🟡 中 |

### 3.3 CSS/样式

| 问题 | 位置 | 严重度 |
|------|------|--------|
| 全局字符串类名，无 CSS Modules，存在冲突风险 | 全局 | 🟡 中 |
| 手工类名拼接（三元表达式），不使用 clsx 等工具 | `AttachmentClip.tsx:10-12` 等 | 🟢 低 |

### 3.4 测试覆盖

| 指标 | 数值 |
|------|------|
| 测试文件数 | ~133 |
| 源文件数 | ~721 |
| 文件覆盖率 | ~18% |
| UI 组件测试 | 大面积缺失 |

---

## 四、优化优先级建议

### P0 - 高影响、快速见效

1. **HomeView / HomeScreen 渲染优化**：memo + 稳定 props 引用（影响最大的渲染路径）
2. **useHomeScreenActions 稳定化**：useMemo 包裹返回对象
3. **createHomeSidebarProps / createHomeMainContentProps 稳定化**

### P1 - 中等影响、需要重构

4. **useAppController 拆分**：按职责拆为 useConnectionManager / useSandboxOrchestrator 等
5. **useComposerCommandPalette 拆分**：按关注点拆为 useTriggerDetection / useKeyboardNavigation 等
6. **超大组件拆分**：HomeViewMainContent / WorkspaceSidebarSection

### P2 - 架构改善

7. **消除跨 feature 直接耦合**：通过 shared 层或 public API 导出
8. **Composer 实现统一**：合并两套 Composer 逻辑
9. **引入 CSS Modules 或 clsx**

### P3 - 长期改善

10. **评估替换自定义 Store**：考虑 Zustand 等轻量方案
11. **补充 UI 组件测试覆盖**
12. **Terminal / Composer 懒加载**
