---
type: plan
status: pending
created: 2026-04-04T11:40:00+08:00
updated: 2026-04-04T11:40:00+08:00
execution_mode: single-agent
priority: P0
estimated_hours: 4
tags:
  - feature
  - ui
  - account
  - rate-limits
related_docs:
  - task-brief.md
  - exploration-report.md
---

# 账户额度显示功能 - 实现计划

## 1. 概述

### 1.1 背景

用户在使用 Codex App Plus 时，需要实时了解账户的使用额度情况，包括 5 小时限额和周限额的剩余量，以便合理安排使用计划。当前应用虽然已经在后台获取了额度数据（`rateLimits`），但未在 UI 层展示给用户。

### 1.2 目标

在 HomeView 主界面中添加账户额度显示区域，展示：
- 5 小时限额的使用情况（百分比、重置时间）
- 周限额的使用情况（百分比、重置时间）
- 支持"已使用"/"剩余"两种显示模式切换
- 支持手动刷新功能

### 1.3 范围

**包含**：
- 在 HomeView 中新增 AccountLimitsSection 组件
- 创建 ViewModel 层处理数据转换和格式化
- 添加中英文国际化支持
- 处理边界情况（数据缺失、部分字段为 null）

**不包含**：
- 定时自动刷新（P2 优先级，后续迭代）
- 额度不足警告提示（P2 优先级，后续迭代）
- 顶部状态栏简洁指示器（P2 优先级，后续迭代）

## 2. 需求分析

### 2.1 功能需求

#### FR1: 额度信息展示
- **FR1.1**: 显示 5 小时限额的使用百分比
- **FR1.2**: 显示周限额的使用百分比
- **FR1.3**: 显示每个限额窗口的重置时间
- **FR1.4**: 显示窗口时长（如 "5 hours"、"7 days"）

#### FR2: 显示模式切换
- **FR2.1**: 支持"已使用"模式（显示 `usedPercent`）
- **FR2.2**: 支持"剩余"模式（显示 `100 - usedPercent`）
- **FR2.3**: 用户偏好持久化到本地存储

#### FR3: 手动刷新
- **FR3.1**: 提供刷新按钮
- **FR3.2**: 刷新时显示加载状态
- **FR3.3**: 刷新失败时显示错误提示

#### FR4: Credits 账户支持
- **FR4.1**: 如果 `credits.unlimited === true`，显示 "Unlimited" 标签
- **FR4.2**: 如果 `credits.balance` 存在，显示余额信息

### 2.2 非功能需求

#### NFR1: 性能
- 刷新操作响应时间 < 2 秒
- 组件渲染不影响 HomeView 整体性能

#### NFR2: 可用性
- 数据缺失时优雅降级，不显示错误界面
- 国际化支持中英文

#### NFR3: 可维护性
- 遵循现有代码风格和架构模式
- ViewModel 层独立，便于单元测试

### 2.3 边界情况处理

| 场景 | 处理方式 | 验收标准 |
|------|----------|----------|
| `rateLimits === null` | 隐藏整个 AccountLimitsSection | 不显示任何额度信息 |
| `primary === null` | 隐藏 5 小时限额卡片 | 只显示周限额卡片 |
| `secondary === null` | 隐藏周限额卡片 | 只显示 5 小时限额卡片 |
| `resetsAt === null` | 显示 "Unknown" | 显示占位文本 |
| `windowDurationMins === null` | 不显示窗口时长 | 只显示重置时间 |
| `credits.unlimited === true` | 显示 "Unlimited" 标签 | 在卡片顶部显示徽章 |
| `credits.balance` 存在 | 显示余额信息 | 在独立卡片中显示 |

## 3. 设计方案

### 3.1 架构设计

```
UI 层（HomeView）
  ↓
AccountLimitsSection.tsx (容器组件)
  ↓
AccountLimitCard.tsx (展示组件)
  ↓
homeAccountLimitsModel.ts (ViewModel 层)
  ↓
useAppSelector(state => state.rateLimits) (State 层)
  ↓
appControllerAccount.ts (Controller 层)
  ↓
Protocol 层（已有类型定义）
```

### 3.2 组件设计

#### 3.2.1 AccountLimitsSection.tsx

**职责**：
- 从全局状态读取 `rateLimits`
- 调用 ViewModel 层处理数据
- 渲染卡片网格和刷新按钮
- 处理显示模式切换

**Props**：
```typescript
interface AccountLimitsSectionProps {
  className?: string;
}
```

**状态**：
```typescript
const [showRemaining, setShowRemaining] = useState<boolean>(() => {
  return localStorage.getItem('accountLimits.showRemaining') === 'true';
});
const [isRefreshing, setIsRefreshing] = useState(false);
```

#### 3.2.2 AccountLimitCard.tsx

**职责**：
- 展示单个限额指标（标签、百分比、说明文字）
- 支持可选的徽章显示（如 "Unlimited"）

**Props**：
```typescript
interface AccountLimitCardProps {
  label: string;           // "Session usage" / "Weekly usage"
  value: string;           // "45%" / "Unlimited"
  caption: string;         // "Resets in 2 hours (5 hours window)"
  badge?: string;          // "Unlimited"
  className?: string;
}
```

#### 3.2.3 homeAccountLimitsModel.ts

**职责**：
- 将 `RateLimitSnapshot` 转换为 UI 所需的卡片数据
- 处理百分比计算（已使用/剩余）
- 格式化重置时间和窗口时长

**核心函数**：
```typescript
export interface AccountLimitCardData {
  label: string;
  value: string;
  caption: string;
  badge?: string;
}

export function buildAccountLimitCards(
  rateLimits: RateLimitSnapshot | null,
  showRemaining: boolean,
  t: (key: string) => string
): AccountLimitCardData[];

function formatResetTime(resetsAt: number | null): string;
function formatWindowDuration(windowDurationMins: number | null): string;
function buildWindowCaption(resetLabel: string, windowDuration: string): string;
```

### 3.3 数据流设计

#### 3.3.1 初始加载
```
useAppController 启动
  ↓
refreshAccountState()
  ↓
loadRateLimits()
  ↓
dispatch({ type: "rateLimits/updated", rateLimits })
  ↓
AccountLimitsSection 通过 useAppSelector 获取数据
  ↓
调用 buildAccountLimitCards() 转换数据
  ↓
渲染卡片
```

#### 3.3.2 手动刷新
```
用户点击刷新按钮
  ↓
setIsRefreshing(true)
  ↓
调用 hostBridge.app.refreshAccountState()
  ↓
等待 rateLimits 更新（通过 useEffect 监听）
  ↓
setIsRefreshing(false)
```

#### 3.3.3 显示模式切换
```
用户点击切换按钮
  ↓
setShowRemaining(!showRemaining)
  ↓
localStorage.setItem('accountLimits.showRemaining', value)
  ↓
重新调用 buildAccountLimitCards()
  ↓
重新渲染卡片
```

### 3.4 UI 设计

#### 3.4.1 布局结构

```tsx
<div className="account-limits-section">
  <div className="account-limits-header">
    <h3 className="account-limits-title">{t('accountLimits.title')}</h3>
    <div className="account-limits-actions">
      <button onClick={handleToggleMode}>
        {showRemaining ? t('accountLimits.showUsed') : t('accountLimits.showRemaining')}
      </button>
      <button onClick={handleRefresh} disabled={isRefreshing}>
        <RefreshIcon className={isRefreshing ? 'spinning' : ''} />
      </button>
    </div>
  </div>
  <div className="account-limits-grid">
    {cards.map(card => (
      <AccountLimitCard key={card.label} {...card} />
    ))}
  </div>
</div>
```

#### 3.4.2 样式参考

参考 CodexMonitor 的 `HomeUsageSection` 样式：
- 卡片式布局，使用 Grid 排列
- 每个卡片包含：标题、大号百分比、说明文字
- 刷新按钮使用旋转动画
- 响应式设计，移动端单列显示

### 3.5 国际化设计

#### 3.5.1 翻译 Key 定义

**en-US.ts**:
```typescript
accountLimits: {
  title: 'Account Limits',
  sessionUsage: 'Session usage',
  sessionRemaining: 'Session left',
  weeklyUsage: 'Weekly usage',
  weeklyRemaining: 'Weekly left',
  creditsBalance: 'Credits balance',
  unlimited: 'Unlimited',
  resetsIn: 'Resets in {time}',
  resetsAt: 'Resets at {time}',
  windowDuration: '{duration} window',
  unknown: 'Unknown',
  showUsed: 'Show used',
  showRemaining: 'Show remaining',
  refresh: 'Refresh',
  refreshing: 'Refreshing...',
}
```

**zh-CN.ts**:
```typescript
accountLimits: {
  title: '账户额度',
  sessionUsage: '会话已用',
  sessionRemaining: '会话剩余',
  weeklyUsage: '每周已用',
  weeklyRemaining: '每周剩余',
  creditsBalance: '积分余额',
  unlimited: '无限制',
  resetsIn: '{time}后重置',
  resetsAt: '{time}重置',
  windowDuration: '{duration}窗口',
  unknown: '未知',
  showUsed: '显示已用',
  showRemaining: '显示剩余',
  refresh: '刷新',
  refreshing: '刷新中...',
}
```

### 3.6 HostBridge 扩展

需要在 `HostBridge` 中暴露刷新方法：

```typescript
// src/bridge/hostBridgeTypes.ts
export interface HostBridge {
  app: {
    // ... 现有方法
    refreshAccountState: () => Promise<void>;
  };
}
```

实现方式：
```typescript
// src/bridge/hostBridge.ts
refreshAccountState: async () => {
  // 调用 Tauri 命令触发 refreshAccountState
  await invoke('refresh_account_state');
}
```

## 4. 执行模式

**选择**: `single-agent`

**理由**：
1. 功能范围明确，主要是 UI 层的组件开发和数据转换
2. 不涉及复杂的后端逻辑或多模块协作
3. 数据获取和状态管理已有完整基础设施
4. 单个 Agent 可以高效完成所有实现步骤

## 5. 实现步骤

### 5.1 准备阶段

#### Step 1: 创建 ViewModel 层
**文件**: `src/features/home/model/homeAccountLimitsModel.ts`

**任务**：
- 定义 `AccountLimitCardData` 接口
- 实现 `buildAccountLimitCards()` 函数
- 实现时间格式化工具函数
- 处理所有边界情况

**验收**：
- 能够正确转换 `RateLimitSnapshot` 为卡片数据
- 支持"已使用"/"剩余"两种模式
- 正确处理 null 字段

#### Step 2: 添加国际化翻译
**文件**: 
- `src/i18n/messages/en-US.ts`
- `src/i18n/messages/zh-CN.ts`

**任务**：
- 添加 `accountLimits` 命名空间
- 添加所有翻译 key

**验收**：
- 中英文翻译完整
- 支持参数插值（如 `{time}`）

### 5.2 组件开发阶段

#### Step 3: 创建 AccountLimitCard 组件
**文件**: `src/features/home/ui/AccountLimitCard.tsx`

**任务**：
- 实现展示组件
- 添加样式文件 `AccountLimitCard.css`
- 支持可选的 badge 显示

**验收**：
- 能够正确渲染标签、百分比、说明文字
- 样式符合设计规范

#### Step 4: 创建 AccountLimitsSection 组件
**文件**: `src/features/home/ui/AccountLimitsSection.tsx`

**任务**：
- 实现容器组件
- 集成 ViewModel 层
- 实现显示模式切换逻辑
- 实现手动刷新逻辑
- 添加样式文件 `AccountLimitsSection.css`

**验收**：
- 能够从全局状态读取 `rateLimits`
- 显示模式切换正常工作
- 刷新按钮正常工作
- 加载状态正确显示

#### Step 5: 集成到 HomeView
**文件**: `src/features/home/ui/HomeView.tsx`

**任务**：
- 在 `HomeViewMainContent` 中添加 `AccountLimitsSection`
- 调整布局，确保不影响现有功能

**验收**：
- AccountLimitsSection 正确显示在 HomeView 中
- 不影响现有功能的布局和交互

### 5.3 HostBridge 扩展阶段

#### Step 6: 扩展 HostBridge
**文件**: 
- `src/bridge/hostBridgeTypes.ts`
- `src/bridge/hostBridge.ts`
- `src-tauri/src/commands.rs`

**任务**：
- 在 `HostBridge` 接口中添加 `refreshAccountState` 方法
- 在 Rust 端添加 `refresh_account_state` 命令
- 实现命令逻辑，调用现有的 `refreshAccountState` 函数

**验收**：
- 前端可以通过 `hostBridge.app.refreshAccountState()` 触发刷新
- 刷新后 `rateLimits` 状态正确更新

### 5.4 测试和优化阶段

#### Step 7: 边界情况测试
**任务**：
- 测试 `rateLimits === null` 场景
- 测试 `primary === null` 场景
- 测试 `secondary === null` 场景
- 测试 `resetsAt === null` 场景
- 测试 Credits 账户场景

**验收**：
- 所有边界情况都能优雅降级
- 不出现错误或崩溃

#### Step 8: 性能优化
**任务**：
- 检查组件渲染性能
- 优化不必要的重渲染
- 确保刷新操作响应时间 < 2 秒

**验收**：
- 组件渲染流畅
- 刷新操作响应及时

#### Step 9: 代码审查和文档
**任务**：
- 代码风格检查
- 添加必要的注释
- 更新 CLAUDE.md（如有必要）

**验收**：
- 代码符合项目规范
- 关键逻辑有注释说明

## 6. 风险和依赖

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 协议版本不兼容 | 高 | 确认当前 `codex-cli` 版本为 0.128.0，协议对齐 |
| 刷新操作性能问题 | 中 | 添加防抖逻辑，避免频繁刷新 |
| 时间格式化本地化问题 | 低 | 使用现有的 `src/utils/time.ts` 工具 |

### 6.2 依赖项

| 依赖 | 状态 | 说明 |
|------|------|------|
| `rateLimits` 全局状态 | ✅ 已有 | 在 `appReducer.ts` 中已定义 |
| `account/rateLimits/read` API | ✅ 已有 | 在 `appControllerAccount.ts` 中已实现 |
| `RateLimitSnapshot` 类型 | ✅ 已有 | 在 `src/protocol/generated/v2/` 中已生成 |
| `useAppSelector` hook | ✅ 已有 | 在 `src/state/store.tsx` 中已实现 |
| `useI18n` hook | ✅ 已有 | 在 `src/i18n/` 中已实现 |

### 6.3 外部依赖

无新增外部依赖，使用现有技术栈。

## 7. 文档关联

- [[task-brief.md]] - 任务简报
- [[exploration-report.md]] - 探索报告
- `src/app/controller/appControllerAccount.ts` - 账户控制器
- `src/state/appReducer.ts` - 状态管理
- `src/protocol/generated/v2/RateLimitSnapshot.ts` - 协议类型
- `E:\code\CodexMonitor\src\features\home\components\HomeUsageSection.tsx` - 参考实现

## 8. 验收标准

### 8.1 功能验收

- [ ] 在 HomeView 中能够看到账户额度显示区域
- [ ] 正确显示 5 小时限额和周限额的百分比
- [ ] 正确显示窗口重置时间
- [ ] 显示模式切换正常工作（已使用 ↔ 剩余）
- [ ] 手动刷新按钮正常工作
- [ ] 刷新时显示加载状态
- [ ] 中英文国际化正常工作

### 8.2 边界情况验收

- [ ] `rateLimits === null` 时隐藏整个区域
- [ ] `primary === null` 时只显示周限额
- [ ] `secondary === null` 时只显示 5 小时限额
- [ ] `resetsAt === null` 时显示 "Unknown"
- [ ] Credits 账户正确显示 "Unlimited" 或余额

### 8.3 性能验收

- [ ] 刷新操作响应时间 < 2 秒
- [ ] 组件渲染不影响 HomeView 整体性能
- [ ] 显示模式切换流畅无卡顿

### 8.4 代码质量验收

- [ ] 代码符合项目编码风格
- [ ] 关键逻辑有注释说明
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 警告

---

**创建时间**: 2026-04-04 11:40  
**预计工时**: 4 小时  
**优先级**: P0
