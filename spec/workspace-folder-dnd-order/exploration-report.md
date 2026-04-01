# 工作区文件夹拖拽排序探索报告

## 背景

需求目标是在**左侧工作区列表**内实现：
- 工作区文件夹可拖拽
- 拖拽改变排列顺序
- 支持“自动排队插队”的智能吸附分组规则
- 拖拽过程高性能动画
- 影响范围仅限左侧工作区列表

本报告基于现有仓库实现进行定位、能力评估、缺口分析与技术方案比较。

---

## 现状概览

### 1) 左侧工作区列表组件结构

左侧栏渲染链路：
1. `App` 注入 `workspace` 控制器。
2. `HomeScreen` 将 roots/选择状态/操作透传给 `HomeView`。
3. `HomeView` 通过 `HomeSidebar` 渲染侧边栏。
4. `HomeSidebar` 内部使用 `WorkspaceSidebarSection` 渲染“工作区”区块。

核心表现：
- `WorkspaceSidebarSection` 使用 `props.roots.map(...)` 线性渲染工作区顺序。
- 当前仅有展开/收起、会话列表、菜单、创建/删除等交互，无拖拽能力。

### 2) 状态与持久化

工作区根目录状态由 `useWorkspaceRoots` 自管理（组件级 hook，非全局 store）：
- `roots` 与 `selectedRootId` 用 `useState` 存储。
- 初始化读取 localStorage key：`codex-app-plus.workspace-roots`。
- 变化后写回 localStorage。
- `addRoot` 采用 merge 逻辑去重后**追加**（保持插入顺序）。
- `removeRoot` 按 key 删除。
- **不存在 reorder API**（例如 `moveRoot(from,to)`）。

结论：当前顺序本质由 `roots` 数组顺序决定，且已具备本地持久化基础，适合在该层新增排序更新接口。

### 3) 拖拽潜在接入点

最直接接入点：
- UI：`WorkspaceSidebarSection`（工作区 root 列表层）
- 状态：`useWorkspaceRoots`（新增重排 action）
- 事件透传：`HomeSidebar` / `HomeView` / `HomeScreen`（将新回调向下传）

理由：
- 需求范围限定左侧工作区列表，不需要修改会话主区域/HostBridge/Rust。
- 当前工作区列表是独立 section，结构清晰，利于局部改造。

### 4) 动画与样式基础

现有样式集中在：
- `src/styles/replica/replica-shell.css`（sidebar 容器、thread-list、item 布局）
- `src/styles/replica/replica-sidebar-tree.css`（workspace root/thread 子项样式）

现有动画仅轻量：
- 箭头旋转 `transition: transform 0.2s`
- sidebar 折叠过渡 `transition: all 0.3s`

缺口：
- 无“拖拽中位移动画/占位符/插入指示线/自动滚动”样式与逻辑。

---

## 关键文件路径

- `src/features/workspace/ui/WorkspaceSidebarSection.tsx`
- `src/features/home/ui/HomeSidebar.tsx`
- `src/features/home/ui/HomeView.tsx`
- `src/features/home/ui/HomeScreen.tsx`
- `src/features/workspace/hooks/useWorkspaceRoots.ts`
- `src/features/shared/utils/storageJson.ts`
- `src/styles/replica/replica-shell.css`
- `src/styles/replica/replica-sidebar-tree.css`
- `src/features/workspace/ui/WorkspaceSidebarSection.test.tsx`
- `src/features/workspace/hooks/useWorkspaceRoots.test.tsx`

---

## 当前能力与缺口

### 已有能力
- 工作区列表渲染、选择、展开收起、会话上下文菜单成熟。
- 工作区列表持久化机制已存在（localStorage + 序列化）。
- 组件职责清晰，适合在 workspace section 局部扩展。
- 测试基线存在，可扩展行为测试。

### 关键缺口
- 缺少拖拽交互框架或原生拖拽逻辑。
- 缺少顺序重排 API（状态层）。
- 缺少智能吸附/自动插队的规则引擎。
- 缺少拖拽过程动画体系与性能策略。
- 未见键盘可访问性拖拽支持（若要完整无障碍需额外设计）。

---

## 约束与架构集成点

### 约束
1. 范围仅左侧工作区列表，避免影响主会话区逻辑。
2. 现有 store 架构是“全局自定义 store + 局部 hook 状态并存”，工作区 roots 目前在局部 hook。
3. 当前依赖中没有 dnd 库，新增方案会涉及依赖策略。
4. 样式系统是全局 CSS 类，不是 CSS-in-JS。

### 与现有架构的集成点

#### React + 自定义 store
- 本需求主要触达 `useWorkspaceRoots`（局部状态）而非 `appReducer`。
- 仅在工作区顺序变化后，通过 `writeStoredJson` 持久化即可。
- 不需要新增全局 reducer action（除非后续要跨页面共享排序行为）。

#### HostBridge / Tauri 边界
- 该功能属于纯前端交互和本地持久化，不需要新增 HostBridge API。
- 不需要修改 Rust/Tauri 命令层。
- 工作区新增入口仍可复用 `requestWorkspaceFolder`（Tauri dialog），与拖拽排序逻辑解耦。

---

## 候选技术方案对比

## 方案 A：引入 dnd-kit（推荐对比方案）

### 思路
在 `WorkspaceSidebarSection` 根列表引入 `DndContext + SortableContext`，每个 workspace root 行改为 sortable item。拖拽结束后计算新顺序，调用 `useWorkspaceRoots` 新增的 `reorderRoots` 持久化。

“自动排队插队”可通过自定义 collision/排序策略实现：
- 基于指针 Y 与目标项中心线阈值决定“前插/后插”
- 对“分组吸附”增加 rule layer（如按路径前缀/项目标签吸附）
- 拖拽悬停超过阈值时间触发自动归组

### 性能
- dnd-kit 使用 transform 驱动位移，性能普遍可控。
- 列表规模中等时体验稳定。
- 可结合 `memo`、`measuring` 配置、减少重渲染提升流畅度。

### 复杂度
- 中等：需要引入依赖与一套约定（sensors、collision、sortable）。
- 智能吸附规则在 dnd-kit 之上可扩展，但需要定制逻辑。

### 可维护性
- 社区成熟，文档完整。
- 新成员更容易理解“标准库 + 可扩展策略”的实现方式。

### 风险
- 新增依赖体积与升级维护成本。
- 与当前自定义列表交互（展开/菜单）需要处理事件冲突（点击/拖拽阈值）。

---

## 方案 B：原生 Pointer Events + FLIP 动画（无第三方依赖）

### 思路
基于 `pointerdown/move/up` 自实现拖拽：
- 维护拖拽中的 active item、目标 index、占位符
- 使用 FLIP（First-Last-Invert-Play）对受影响项做 transform 动画
- 自动滚动、吸附规则、插队算法完全自定义

### 性能
- 理论上可做到最优（按需调度、requestAnimationFrame、最小化状态写入）。
- 但性能质量高度依赖实现质量。

### 复杂度
- 高：需要自行处理触摸/鼠标、滚动容器、命中检测、可访问性、边界条件。
- 智能吸附规则可最灵活，但开发和调试成本最大。

### 可维护性
- 代码心智负担重，对实现者要求高。
- 后续改动风险较高，测试覆盖要求更高。

### 风险
- 容易出现细节 bug（拖拽抖动、滚动穿透、点击误触发、性能退化）。
- 交互一致性和可访问性需要额外投入。

---

## 方案 C：HTML5 Drag and Drop（补充参考，不推荐）

### 简述
使用原生 `dragstart/dragover/drop`。

### 问题
- 自定义动画能力弱，移动端支持与一致性不足。
- 与复杂吸附规则、高性能动画目标不匹配。

---

## 推荐方案

推荐 **方案 A（dnd-kit）**。

推荐原因：
1. 能较快落地“可拖拽排序 + 插队规则 + 平滑动画”。
2. 性能与工程复杂度平衡最好。
3. 与当前组件化结构天然契合，改动主要局限在 `WorkspaceSidebarSection` + `useWorkspaceRoots`。
4. 可渐进实现：先完成基础重排，再迭代“智能吸附分组规则”。

建议分阶段：
- Phase 1：基础拖拽排序 + 持久化 + 动画
- Phase 2：自动排队插队（阈值 + 悬停策略）
- Phase 3：分组智能吸附（可配置规则）

---

## 风险与验证建议

### 主要风险
1. 拖拽与现有点击/展开/菜单操作冲突。
2. 列表滚动容器中拖拽自动滚动体验不稳定。
3. 吸附规则引入后，用户预期与实际插入位置偏差。
4. 重排后 `selectedRootId`、展开状态、线程显示状态是否保持一致。

### 验证建议

#### 单元/组件测试
- `useWorkspaceRoots`：新增 reorder 后持久化与恢复测试。
- `WorkspaceSidebarSection`：
  - 拖拽前后 DOM 顺序变化
  - 选择状态不丢失
  - 展开状态映射不异常
  - 吸附规则关键路径（前插/后插/分组）

#### 手工验证
- 低性能设备下连续快速拖拽，观察掉帧。
- 有滚动条时跨屏拖拽、边缘自动滚动。
- 与“新建会话/更多菜单/展开收起”组合操作。

#### 性能观测
- DevTools Performance：检查 layout/recalc style 热点。
- 目标：拖拽主路径以 transform 为主，避免频繁强制同步布局。

---

## 结论

当前代码库在“左侧工作区列表”已有良好结构与持久化基础，但尚无拖拽与重排能力。最优实施路径是在 `WorkspaceSidebarSection` 引入可排序拖拽层，并在 `useWorkspaceRoots` 增加重排接口，保持改动局部化且不触及 HostBridge/Tauri。对于“自动排队插队”智能吸附，建议以可迭代规则层逐步增强，优先保证基础交互稳定与性能表现。
