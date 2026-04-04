# 探索报告：账户额度显示功能

## 检索到的历史经验

### 经验记忆
- 暂无直接相关的经验记忆

### 知识记忆
- **[KNOW-001] codex-app-plus 设置界面架构分析**：了解了当前项目的设置界面结构，为后续 UI 集成提供参考

### Auto Memory
- **前端禁用 index 聚合导出**：前端架构优化时避免新增 barrel export，优先直接导入

## 参考项目分析

### 1. Codex 官方项目 (E:\code\codex)

#### API 协议定义
**文件位置**：`codex-rs/app-server-protocol/schema/typescript/v2/`

**核心数据结构**：

```typescript
// GetAccountRateLimitsResponse.ts
export type GetAccountRateLimitsResponse = { 
  rateLimits: RateLimitSnapshot, 
  rateLimitsByLimitId: { [key in string]?: RateLimitSnapshot } | null,
};

// RateLimitSnapshot.ts
export type RateLimitSnapshot = { 
  limitId: string | null,
  limitName: string | null,
  primary: RateLimitWindow | null,      // 5小时限额窗口
  secondary: RateLimitWindow | null,    // 周限额窗口
  credits: CreditsSnapshot | null,
  planType: PlanType | null,
};

// RateLimitWindow.ts
export type RateLimitWindow = { 
  usedPercent: number,                  // 已使用百分比
  windowDurationMins: number | null,    // 窗口时长（分钟）
  resetsAt: number | null,              // 重置时间戳
};

// CreditsSnapshot.ts
export type CreditsSnapshot = { 
  hasCredits: boolean,
  unlimited: boolean,
  balance: string | null,
};
```

**关键发现**：
- 官方协议支持多桶限额（`rateLimitsByLimitId`），但向后兼容单桶视图（`rateLimits`）
- `primary` 对应 5 小时限额，`secondary` 对应周限额
- `usedPercent` 直接提供百分比，无需前端计算
- `resetsAt` 提供重置时间戳，可用于倒计时显示

### 2. CodexMonitor 项目 (E:\code\CodexMonitor)

#### UI 展示方案
**文件位置**：`src/features/home/components/HomeUsageSection.tsx`

**核心实现**：
- 在 Home 页面的 "Account limits" 区域展示额度信息
- 使用卡片式布局（`HomeUsageCard`）展示多个指标
- 支持显示"已使用"或"剩余"百分比（通过 `usageShowRemaining` 切换）
- 显示窗口重置时间和窗口时长

**UI 结构**：
```tsx
<div className="home-account">
  <div className="home-section-header">
    <div className="home-section-title">Account limits</div>
    <div className="home-section-meta">{accountMeta}</div>
  </div>
  <div className="home-usage-grid home-account-grid">
    {accountCards.map((card) => (
      <HomeUsageCard card={card} key={card.label} />
    ))}
  </div>
</div>
```

**数据处理逻辑**：
**文件位置**：`src/features/home/homeUsageViewModel.ts`

```typescript
// 构建账户卡片
if (usagePercentLabels.sessionPercent !== null) {
  accountCards.push({
    label: usageShowRemaining ? "Session left" : "Session usage",
    value: `${usagePercentLabels.sessionPercent}%`,
    caption: buildWindowCaption(
      usagePercentLabels.sessionResetLabel,
      accountRateLimits?.primary?.windowDurationMins,
      "Current window",
    ),
  });
}

if (usagePercentLabels.showWeekly && usagePercentLabels.weeklyPercent !== null) {
  accountCards.push({
    label: usageShowRemaining ? "Weekly left" : "Weekly usage",
    value: `${usagePercentLabels.weeklyPercent}%`,
    caption: buildWindowCaption(
      usagePercentLabels.weeklyResetLabel,
      accountRateLimits?.secondary?.windowDurationMins,
      "Longer window",
    ),
  });
}
```

**关键发现**：
- 使用 `getUsageLabels` 工具函数处理百分比和重置时间标签
- 支持"已使用"/"剩余"两种显示模式
- 周限额显示是可选的（通过 `showWeekly` 控制）
- 使用 `buildWindowCaption` 格式化窗口信息

## 当前代码库分析

### 1. 认证模块实现

**文件位置**：`src/app/controller/appControllerAccount.ts`

**核心功能**：
- `loadRateLimits()`: 调用 `account/rateLimits/read` 获取额度数据
- `refreshAccountState()`: 并行刷新认证状态、账户信息和额度限制
- 通过 `dispatch({ type: "rateLimits/updated", rateLimits })` 更新全局状态

**API 调用方式**：
```typescript
async function loadRateLimits(client: AccountRequestClient, dispatch: Dispatch): Promise<void> {
  try {
    const response = (await client.request("account/rateLimits/read", undefined)) as GetAccountRateLimitsResponse;
    dispatch({ type: "rateLimits/updated", rateLimits: response.rateLimits });
  } catch {
    dispatch({ type: "rateLimits/updated", rateLimits: null });
  }
}
```

### 2. 状态管理架构

**文件位置**：`src/state/appReducer.ts`

**状态存储**：
```typescript
case "rateLimits/updated":
  return { ...state, rateLimits: action.rateLimits };
```

**通知监听**：
**文件位置**：`src/app/controller/appControllerNotifications.ts`

```typescript
if (method === "account/rateLimits/updated") {
  const payload = params as AccountRateLimitsUpdatedNotification;
  dispatch({ type: "rateLimits/updated", rateLimits: payload.rateLimits });
  return;
}
```

**关键发现**：
- 全局状态中已有 `rateLimits: RateLimitSnapshot | null` 字段
- 支持主动拉取（`account/rateLimits/read`）和被动推送（`account/rateLimits/updated` 通知）
- 数据已在 `useAppController` 启动时自动加载（通过 `refreshAccountState`）

### 3. 协议类型定义

**文件位置**：`src/protocol/generated/v2/`

当前项目已生成完整的协议类型：
- `RateLimitSnapshot.ts`
- `RateLimitWindow.ts`
- `CreditsSnapshot.ts`
- `GetAccountRateLimitsResponse.ts`
- `AccountRateLimitsUpdatedNotification.ts`

**类型定义与官方一致**，无需额外生成。

### 4. 适合显示额度信息的 UI 位置

**候选位置分析**：

#### 选项 A：HomeView 主界面
**文件位置**：`src/features/home/ui/HomeView.tsx`

**优势**：
- 用户主要工作界面，可见性高
- 已有 `account` 和 `rateLimitSummary` props 传入
- 可参考 CodexMonitor 的 HomeUsageSection 设计

**当前状态**：
- `rateLimitSummary: string | null` 已传入但未使用
- 需要在 `HomeViewMainContent` 或新增区域展示

#### 选项 B：设置界面
**文件位置**：`src/features/settings/ui/SettingsView.tsx`

**优势**：
- 与账户相关设置集中
- 不占用主界面空间

**劣势**：
- 用户需要主动打开设置才能看到
- 可见性较低

#### 选项 C：顶部状态栏
**文件位置**：`src/features/shared/ui/ControlBar.tsx` 或 `src/features/home/ui/HomeSidebar.tsx`

**优势**：
- 始终可见
- 适合简洁的百分比显示

**劣势**：
- 空间有限，难以展示详细信息

**推荐方案**：
- **主方案**：在 HomeView 主界面添加额度显示区域（参考 CodexMonitor 的 Account limits 区域）
- **辅助方案**：在顶部状态栏添加简洁的百分比指示器（可选）

### 5. API 调用封装方式

**文件位置**：`src/protocol/appServerClient.ts` 和 `src/protocol/methods.ts`

**调用方式**：
```typescript
const appServerClient = createHostBridgeAppServerClient(hostBridge);
const response = await appServerClient.request("account/rateLimits/read", undefined);
```

**关键发现**：
- 已有完整的 RPC 客户端封装
- 支持类型安全的请求/响应
- 错误处理已在 `appControllerAccount.ts` 中实现

### 6. 更新频率和缓存策略

**当前实现**：
- **启动时加载**：`useAppController` 初始化时调用 `refreshAccountState()`
- **通知驱动更新**：监听 `account/rateLimits/updated` 通知自动更新
- **手动刷新**：可通过 `refreshAccountState()` 主动刷新

**建议策略**：
- 保持现有的通知驱动更新机制
- 在 UI 层添加手动刷新按钮（参考 CodexMonitor 的 RefreshCw 按钮）
- 考虑添加定时刷新（如每 5 分钟），避免长时间运行时数据过期

## 外部知识

### 时间格式化
CodexMonitor 使用了多个时间格式化工具：
- `formatRelativeTime()`: 相对时间（如 "2 minutes ago"）
- `formatDayLabel()`: 日期标签
- `buildWindowCaption()`: 窗口重置时间描述

**建议**：
- 复用当前项目的 `src/utils/time.ts` 工具
- 如需新增格式化函数，参考 CodexMonitor 的实现

### 百分比计算
官方 API 已提供 `usedPercent`，无需前端计算。

**剩余百分比计算**：
```typescript
const remainingPercent = 100 - usedPercent;
```

## 对 Spec 创建的建议

### 1. 实现方向

**推荐架构**：
```
UI 层（HomeView）
  ↓
ViewModel 层（新增 homeAccountLimitsModel.ts）
  ↓
State 层（已有 rateLimits 字段）
  ↓
Controller 层（已有 appControllerAccount.ts）
  ↓
Protocol 层（已有完整类型定义）
```

**核心组件**：
- `AccountLimitsSection.tsx`: 额度显示区域（参考 CodexMonitor 的 HomeUsageSection）
- `AccountLimitCard.tsx`: 单个限额卡片（参考 HomeUsageCard）
- `homeAccountLimitsModel.ts`: 数据处理逻辑（参考 homeUsageViewModel）

### 2. 已知的边界情况和风险

#### 边界情况
1. **无额度数据**：`rateLimits === null`
   - 显示占位符或隐藏区域
   - 提示用户登录或检查网络

2. **部分字段缺失**：
   - `primary === null`: 无 5 小时限额
   - `secondary === null`: 无周限额
   - 需要优雅降级显示

3. **Credits 账户**：
   - `credits.unlimited === true`: 显示 "Unlimited"
   - `credits.balance`: 显示余额字符串

4. **窗口重置时间**：
   - `resetsAt === null`: 显示 "Unknown" 或隐藏倒计时
   - 需要处理时区和本地化

#### 风险
1. **协议版本兼容性**：
   - 当前协议对齐 `codex-cli 0.114.0`
   - 如果官方协议变更，需要重新生成类型

2. **性能影响**：
   - 如果添加定时刷新，需要控制频率避免过多 API 调用
   - 倒计时更新需要优化渲染性能

3. **国际化**：
   - 需要在 `src/i18n/messages/` 中添加中英文翻译
   - 时间格式需要考虑本地化

### 3. 可复用的现有组件

#### 直接复用
- `src/features/shared/ui/` 中的基础 UI 组件
- `src/utils/time.ts` 中的时间工具函数
- `src/state/store.tsx` 中的状态管理机制

#### 参考实现
- CodexMonitor 的 `HomeUsageSection.tsx`: UI 布局和交互
- CodexMonitor 的 `homeUsageViewModel.ts`: 数据处理逻辑
- CodexMonitor 的 `usageLabels.ts`: 标签格式化

#### 需要新增
- 额度显示专用的 ViewModel 层
- 额度卡片组件（可参考 CodexMonitor 但需适配当前项目样式）
- 刷新和切换显示模式的交互逻辑

### 4. 技术选型建议

**状态管理**：
- 使用现有的 `appReducer` 和 `useAppSelector`
- 无需引入新的状态管理库

**样式方案**：
- 遵循当前项目的 CSS 模块化方案
- 参考 `src/features/home/ui/HomeView.css` 的样式风格

**国际化**：
- 在 `src/i18n/messages/en-US.ts` 和 `zh-CN.ts` 中添加翻译
- 使用 `useI18n()` hook 获取翻译函数

**测试策略**：
- 为 ViewModel 层编写单元测试（参考 `homeUsageViewModel.test.ts`）
- 为组件编写集成测试（参考 `HomeView.test.tsx`）
- 测试边界情况（null 数据、部分字段缺失）

### 5. 实现优先级建议

**P0（核心功能）**：
1. 在 HomeView 中显示 5 小时限额和周限额百分比
2. 显示窗口重置时间
3. 支持"已使用"/"剩余"切换

**P1（增强功能）**：
1. 添加手动刷新按钮
2. 显示 Credits 余额（如果有）
3. 显示计划类型（Plan Type）

**P2（可选功能）**：
1. 倒计时显示（距离重置还有多久）
2. 定时自动刷新
3. 额度不足时的警告提示

## 总结

### 技术可行性
- ✅ 官方 API 完整支持
- ✅ 当前项目已有完整的协议类型定义
- ✅ 状态管理和数据流已就绪
- ✅ 有成熟的参考实现（CodexMonitor）

### 实现复杂度
- **低**：数据获取和状态管理（已有基础设施）
- **中**：UI 组件开发和样式适配
- **中**：边界情况处理和国际化

### 关键依赖
- 依赖 `codex app-server` 的 `account/rateLimits/read` API
- 依赖全局状态中的 `rateLimits` 字段
- 依赖 `useAppController` 的初始化流程

### 建议的实现路径
1. **阶段一**：创建 ViewModel 层，处理数据转换和格式化
2. **阶段二**：开发 UI 组件，实现基础显示功能
3. **阶段三**：添加交互功能（刷新、切换显示模式）
4. **阶段四**：完善边界情况处理和国际化
5. **阶段五**：编写测试和文档
