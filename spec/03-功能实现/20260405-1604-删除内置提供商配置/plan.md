---
type: plan
status: pending
created: 2026-04-05T16:04:00+08:00
updated: 2026-04-05T16:04:00+08:00
execution_mode: single-agent
priority: P1
estimated_hours: 6
tags:
  - refactor
  - settings
  - provider
  - breaking-change
related_docs:
  - exploration-report.md
---

# 删除内置提供商配置功能 - 实现计划

## 1. 概述

### 1.1 背景

Codex App Plus 内置的提供商配置功能与 CC Switch 项目存在功能重叠和配置冲突。CC Switch 是专门用于管理多个 AI 编码工具配置的跨平台工具，直接管理 `.codex/auth.json` 和 `.codex/config.toml` 文件。内置功能会与 CC Switch 形成竞争关系，导致配置覆盖和不一致。

### 1.2 目标

- 删除内置的提供商 CRUD 功能（增删改查、应用配置）
- 保留只读显示当前激活提供商的功能
- 保留 ChatGPT 模式切换功能
- 保留 OAuth 快照机制
- 在设置页面添加 CC Switch 推荐说明

### 1.3 范围

**删除**：
- 提供商列表存储（`codex-providers.json`）
- 提供商 CRUD UI 组件（列表、编辑对话框、删除对话框）
- 提供商管理后端实现（`codex_provider` 模块）
- 应用提供商配置到官方文件的功能
- 相关的 Tauri 命令和 Bridge 接口
- 相关的国际化键和 CSS 样式

**保留**：
- 读取当前激活提供商信息（只读显示）
- ChatGPT ↔ API Key 模式切换
- OAuth 快照管理
- 认证模式状态读取

**新增**：
- CC Switch 推荐说明和链接
- 简化的认证模式显示 UI

## 2. 需求分析

### 2.1 功能需求

#### FR1: 删除提供商 CRUD 功能
- **FR1.1**: 删除提供商列表 UI（`CodexProviderListCard`）
- **FR1.2**: 删除提供商编辑对话框（`CodexProviderDialog`）
- **FR1.3**: 删除提供商删除对话框（`CodexProviderDeleteDialog`）
- **FR1.4**: 删除后端 `codex_provider` 模块
- **FR1.5**: 删除相关 Tauri 命令和 Bridge 接口

#### FR2: 保留只读显示功能
- **FR2.1**: 保留读取当前 providerKey 的函数
- **FR2.2**: 在简化的 UI 中显示当前激活的 providerKey（只读）

#### FR3: 保留 ChatGPT 模式切换
- **FR3.1**: 保留 `activate_codex_chatgpt()` 函数
- **FR3.2**: 保留 OAuth 快照捕获和恢复功能
- **FR3.3**: 保留认证模式状态读取功能

#### FR4: 添加 CC Switch 推荐
- **FR4.1**: 在设置页面添加说明文本
- **FR4.2**: 提供 CC Switch 下载链接
- **FR4.3**: 提供手动配置文档链接

### 2.2 非功能需求

#### NFR1: 向后兼容
- 删除功能不影响现有用户的 `.codex/auth.json` 和 `.codex/config.toml`
- 现有的 `codex-providers.json` 文件不会被自动删除（用户可手动清理）

#### NFR2: 可维护性
- 清理所有相关代码，避免留下死代码
- 更新文档和注释

#### NFR3: 用户体验
- 提供清晰的迁移指南
- 推荐使用 CC Switch 作为替代方案

## 3. 设计方案

### 3.1 架构变更

#### 3.1.1 删除的模块

**后端 Rust 模块**：
```
src-tauri/src/codex_provider/          # 完整删除
  ├── mod.rs                           # 提供商管理核心逻辑
  ├── config_patch.rs                  # TOML 配置合并
  ├── support.rs                       # 工具函数
  └── tests.rs                         # 单元测试
```

**前端 TypeScript 模块**：
```
src/features/settings/ui/
  ├── CodexProviderListCard.tsx        # 删除
  ├── CodexProviderDialog.tsx          # 删除
  └── CodexProviderDeleteDialog.tsx    # 删除

src/features/settings/config/
  ├── codexProviderConfig.ts           # 删除
  └── codexProviderConfig.test.ts      # 删除
```

#### 3.1.2 保留并简化的模块

**后端 `codex_auth` 模块**（部分保留）：
- 保留：`get_codex_auth_mode_state()`
- 保留：`activate_codex_chatgpt()`
- 保留：`capture_codex_oauth_snapshot()`
- 删除：`activate_codex_provider()`（依赖 `codex_provider` 模块）

**前端认证模式 UI**（简化）：
- 保留：`CodexAuthModeCard`（简化为只显示当前模式和 providerKey）
- 修改：`ConfigSettingsSection`（移除提供商管理相关代码）

### 3.2 数据模型变更

#### 3.2.1 删除的类型（`src/bridge/appTypes.ts`）

```typescript
// 完整删除以下类型
export interface CodexProviderDraft { ... }
export interface CodexProviderRecord { ... }
export interface CodexProviderStore { ... }
export interface UpsertCodexProviderInput { ... }
export interface DeleteCodexProviderInput { ... }
export interface ApplyCodexProviderInput { ... }
export interface CodexProviderApplyResult { ... }
```

#### 3.2.2 简化的类型

```typescript
// CodexAuthModeStateOutput 简化
export interface CodexAuthModeStateOutput {
  readonly activeMode: CodexAuthMode;
  // 删除：activeProviderId
  readonly activeProviderKey?: string | null; // 保留（用于只读显示）
  readonly oauthSnapshotAvailable: boolean;
}
```

#### 3.2.3 简化的持久化状态

**`codex-auth-mode.json` 简化**：
```json
{
  "active_mode": "apikey",
  // 删除：active_provider_id
  // 删除：active_provider_key
  "updated_at": 1234567890000
}
```

### 3.3 UI 设计

#### 3.3.1 简化后的 ConfigSettingsSection

**删除**：
- `CodexProviderListCard` 组件及其容器

**保留并简化**：
- `CodexAuthModeCard` 组件

**新增**：
- CC Switch 推荐卡片（`CodexProviderRecommendationCard`）

#### 3.3.2 简化后的 CodexAuthModeCard

**显示内容**：
```
┌─────────────────────────────────────┐
│ 认证模式                             │
├─────────────────────────────────────┤
│ 当前模式: API Key                    │
│ 提供商: openai-custom (只读)         │
│                                     │
│ [切换到 ChatGPT]  [登录]            │
└─────────────────────────────────────┘
```

**功能**：
- 显示当前认证模式（ChatGPT / API Key）
- 显示当前 providerKey（只读，从 config.toml 读取）
- 提供"切换到 ChatGPT"按钮
- 提供"登录"按钮（触发 OAuth 流程）

#### 3.3.3 新增的 CodexProviderRecommendationCard

**显示内容**：
```
┌─────────────────────────────────────┐
│ 提供商配置管理                       │
├─────────────────────────────────────┤
│ 推荐使用 CC Switch 管理提供商配置。  │
│                                     │
│ CC Switch 是专门用于管理多个 AI 编码 │
│ 工具配置的跨平台工具，支持统一管理   │
│ 提供商、MCP 服务器和系统提示词。     │
│                                     │
│ [下载 CC Switch]  [查看文档]        │
│                                     │
│ 或者手动编辑配置文件：               │
│ • ~/.codex/auth.json                │
│ • ~/.codex/config.toml              │
└─────────────────────────────────────┘
```

**链接**：
- 下载链接：`https://github.com/farion1231/cc-switch`
- 文档链接：`https://docs.newapi.ai/en/docs/apps/cc-switch`

### 3.4 国际化设计

#### 3.4.1 删除的翻译键

```typescript
// 完整删除以下命名空间
settings.config.providers.*           // 22 个键
settings.config.providerDialog.*      // 15 个键
```

#### 3.4.2 新增的翻译键

**en-US.ts**:
```typescript
settings.config.authMode: {
  title: 'Authentication Mode',
  currentMode: 'Current mode',
  currentProvider: 'Provider',
  chatgptMode: 'ChatGPT',
  apikeyMode: 'API Key',
  switchToChatgpt: 'Switch to ChatGPT',
  login: 'Login',
  unknown: 'Unknown',
},
settings.config.providerRecommendation: {
  title: 'Provider Configuration Management',
  description: 'We recommend using CC Switch to manage provider configurations.',
  ccSwitchIntro: 'CC Switch is a cross-platform tool for managing multiple AI coding tool configurations, supporting unified management of providers, MCP servers, and system prompts.',
  downloadCcSwitch: 'Download CC Switch',
  viewDocs: 'View Documentation',
  manualConfigTitle: 'Or manually edit configuration files:',
  authJsonPath: '~/.codex/auth.json',
  configTomlPath: '~/.codex/config.toml',
}
```

**zh-CN.ts**:
```typescript
settings.config.authMode: {
  title: '认证模式',
  currentMode: '当前模式',
  currentProvider: '提供商',
  chatgptMode: 'ChatGPT',
  apikeyMode: 'API Key',
  switchToChatgpt: '切换到 ChatGPT',
  login: '登录',
  unknown: '未知',
},
settings.config.providerRecommendation: {
  title: '提供商配置管理',
  description: '推荐使用 CC Switch 管理提供商配置。',
  ccSwitchIntro: 'CC Switch 是专门用于管理多个 AI 编码工具配置的跨平台工具，支持统一管理提供商、MCP 服务器和系统提示词。',
  downloadCcSwitch: '下载 CC Switch',
  viewDocs: '查看文档',
  manualConfigTitle: '或者手动编辑配置文件：',
  authJsonPath: '~/.codex/auth.json',
  configTomlPath: '~/.codex/config.toml',
}
```

## 4. 执行模式

**选择**: `single-agent`

**理由**：
1. 主要是删除代码和简化 UI，不涉及复杂的新功能开发
2. 保留的功能已有完整实现，只需简化和重构
3. 文件变更虽多，但逻辑清晰，单个 Agent 可以高效完成
4. 不涉及多模块协作或复杂的架构变更

## 5. 实现步骤

### 5.1 准备阶段

#### Step 1: 备份和确认
**任务**：
- 确认当前代码库状态（git status clean）
- 记录需要删除的文件清单
- 确认保留功能的依赖关系

**验收**：
- 文件清单完整
- 依赖关系清晰

### 5.2 后端删除阶段

#### Step 2: 删除 codex_provider 模块
**文件**：
- `src-tauri/src/codex_provider/mod.rs`
- `src-tauri/src/codex_provider/config_patch.rs`
- `src-tauri/src/codex_provider/support.rs`
- `src-tauri/src/codex_provider/tests.rs`

**任务**：
- 删除整个 `codex_provider` 目录
- 从 `src-tauri/src/lib.rs` 中移除 `mod codex_provider;`

**验收**：
- 目录完全删除
- 编译通过（可能有未使用的导入警告）

#### Step 3: 简化 codex_auth 模块
**文件**：
- `src-tauri/src/codex_auth/mod.rs`
- `src-tauri/src/codex_auth/storage.rs`
- `src-tauri/src/codex_auth/live.rs`

**任务**：
- 删除 `activate_codex_provider()` 函数
- 重构 `get_codex_auth_mode_state()` 函数，移除内置存储依赖：
  - 删除 `list_codex_providers()` 调用
  - 删除 `detect_active_context()` 调用
  - 直接从 `config.toml` 读取 `providerKey`
  - 根据配置文件判断认证模式
- 重构 `activate_codex_chatgpt()` 函数，移除内置存储依赖：
  - 删除 `list_codex_providers()` 调用
  - 删除 `detect_active_context()` 调用
  - 删除 `backfill_current_mode_if_needed()` 调用
- 删除 `detect_active_context()` 函数（依赖内置存储）
- 删除 `build_provider_input_from_live()` 函数（依赖内置存储）
- 简化 `PersistedModeState` 结构体（移除 `active_provider_id` 和 `active_provider_key`）
- 简化 `persist_mode_state()` 函数签名（只保留 `mode` 参数）

**验收**：
- 保留的函数正常工作
- 持久化状态简化为只包含 `active_mode`
- 无内置存储依赖残留

#### Step 4: 删除 Tauri 命令
**文件**：
- `src-tauri/src/commands.rs`

**任务**：
- 删除以下命令：
  - `app_list_codex_providers`
  - `app_upsert_codex_provider`
  - `app_delete_codex_provider`
  - `app_apply_codex_provider`
- 从 `main.rs` 的 `invoke_handler` 中移除这些命令

**验收**：
- 命令完全删除
- Rust 编译通过

#### Step 5: 删除 Rust 类型定义
**文件**：
- `src-tauri/src/models.rs`

**任务**：
- 删除以下类型：
  - `CodexProviderDraft`
  - `CodexProviderRecord`
  - `CodexProviderStore`
  - `UpsertCodexProviderInput`
  - `DeleteCodexProviderInput`
  - `ApplyCodexProviderInput`
  - `CodexProviderApplyResult`
- 简化 `CodexAuthModeStateOutput`（移除 `active_provider_id`）

**验收**：
- 类型定义删除
- 编译通过

### 5.3 前端删除阶段

#### Step 6: 删除 UI 组件
**文件**：
- `src/features/settings/ui/CodexProviderListCard.tsx`
- `src/features/settings/ui/CodexProviderDialog.tsx`
- `src/features/settings/ui/CodexProviderDeleteDialog.tsx`

**任务**：
- 删除这三个组件文件

**验收**：
- 文件完全删除

#### Step 7: 删除配置逻辑
**文件**：
- `src/features/settings/config/codexProviderConfig.ts`
- `src/features/settings/config/codexProviderConfig.test.ts`

**任务**：
- 删除这两个文件

**验收**：
- 文件完全删除

#### Step 8: 删除 Bridge 接口
**文件**：
- `src/bridge/hostBridgeTypes.ts`
- `src/bridge/tauriHostBridge.ts`
- `src/bridge/appTypes.ts`

**任务**：
- 从 `HostBridge.app` 中删除：
  - `listCodexProviders()`
  - `upsertCodexProvider()`
  - `deleteCodexProvider()`
  - `applyCodexProvider()`
- 从 `appTypes.ts` 中删除提供商相关类型
- 简化 `CodexAuthModeStateOutput`

**验收**：
- 接口删除
- TypeScript 编译通过

### 5.4 UI 重构阶段

#### Step 9: 简化 CodexAuthModeCard
**文件**：
- `src/features/settings/ui/CodexAuthModeCard.tsx`

**任务**：
- 简化组件，只显示当前模式和 providerKey（只读）
- 移除"应用提供商"相关逻辑
- 保留"切换到 ChatGPT"和"登录"按钮

**验收**：
- 组件正确显示当前模式
- 正确显示当前 providerKey（从 config.toml 读取）
- 按钮功能正常

#### Step 10: 创建 CodexProviderRecommendationCard
**文件**：
- `src/features/settings/ui/CodexProviderRecommendationCard.tsx`

**任务**：
- 创建新组件
- 显示 CC Switch 推荐说明
- 添加下载链接和文档链接（使用 Tauri `@tauri-apps/plugin-shell` 的 `open()` API）
- 添加手动配置说明
- 确认 `@tauri-apps/plugin-shell` 依赖已安装

**实现示例**：
```typescript
import { open } from '@tauri-apps/plugin-shell';

async function handleOpenDownload() {
  await open('https://github.com/farion1231/cc-switch');
}

async function handleOpenDocs() {
  await open('https://docs.newapi.ai/en/docs/apps/cc-switch');
}
```

**验收**：
- 组件正确渲染
- 链接可点击并在系统默认浏览器中打开
- 中英文国际化正确

#### Step 11: 重构 ConfigSettingsSection
**文件**：
- `src/features/settings/ui/ConfigSettingsSection.tsx`

**任务**：
- 移除 `CodexProviderListCard` 相关代码
- 保留 `CodexAuthModeCard`
- 添加 `CodexProviderRecommendationCard`
- 调整布局

**验收**：
- 设置页面正确显示简化后的 UI
- 不影响其他设置功能

### 5.5 国际化和样式清理阶段

#### Step 12: 更新国际化文件
**文件**：
- `src/i18n/messages/zh-CN.ts`
- `src/i18n/messages/en-US.ts`

**任务**：
- 删除 `settings.config.providers.*` 命名空间（22 个键）
- 删除 `settings.config.providerDialog.*` 命名空间（15 个键）
- 添加 `settings.config.authMode.*` 命名空间（8 个键）
- 添加 `settings.config.providerRecommendation.*` 命名空间（7 个键）

**验收**：
- 旧键完全删除
- 新键完整添加
- 中英文翻译准确

#### Step 13: 清理 CSS 样式
**文件**：
- `src/styles/replica/replica-settings-extra.css`

**任务**：
- 删除 `.codex-provider-*` 相关样式（行 1037-1110，约 80 行）
- 添加新组件的样式（如需要）

**验收**：
- 旧样式完全删除
- 新样式正确应用

### 5.6 测试清理阶段

#### Step 14: 清理测试文件
**文件**：
- `src/features/settings/ui/ConfigSettingsSection.test.tsx`
- `src/features/settings/ui/SettingsView.test.tsx`
- `src/app/controller/useAppController.test.tsx`
- `src/app/controller/useAppController.retry.test.tsx`
- `src/protocol/__tests__/client.test.ts`

**任务**：
- 移除提供商管理相关的测试用例
- 更新快照（如有）

**验收**：
- 所有测试通过
- 无提供商相关的测试残留

### 5.7 验证和文档阶段

#### Step 15: 功能验证
**任务**：
- 启动应用，进入设置页面
- 验证简化后的认证模式卡片正常显示
- 验证 CC Switch 推荐卡片正常显示
- 验证"切换到 ChatGPT"功能正常
- 验证链接可点击

**验收**：
- 所有保留功能正常工作
- UI 显示正确
- 无控制台错误

#### Step 16: 回归测试
**任务**：
- 运行前端测试：`pnpm test`
- 运行 Rust 测试：`cargo test --manifest-path src-tauri/Cargo.toml`
- 运行类型检查：`pnpm run typecheck`

**验收**：
- 所有测试通过
- 无类型错误
- 无编译警告

#### Step 17: 更新文档
**文件**：
- `CLAUDE.md`（如需要）
- `CHANGELOG.md`（如需要）

**任务**：
- 更新项目文档，说明功能变更
- 添加 Breaking Change 说明
- 添加迁移指南

**验收**：
- 文档更新完整
- 迁移指南清晰

## 6. 风险和依赖

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 删除代码导致编译错误 | 高 | 分阶段删除，每步验证编译通过 |
| 保留功能受影响 | 中 | 仔细检查依赖关系，保留必要的函数 |
| 测试失败 | 中 | 及时更新测试用例，清理相关断言 |

### 6.2 用户影响

| 影响 | 严重性 | 缓解措施 |
|------|--------|----------|
| 现有提供商配置丢失 | 低 | 配置存储在独立文件，不会自动删除 |
| 需要学习新工具 | 中 | 提供清晰的 CC Switch 推荐和文档链接 |
| 手动配置门槛提高 | 低 | 提供手动配置说明 |

### 6.3 依赖项

| 依赖 | 状态 | 说明 |
|------|------|------|
| `get_codex_auth_mode_state()` | ✅ 保留 | 读取认证模式状态 |
| `activate_codex_chatgpt()` | ✅ 保留 | 切换到 ChatGPT 模式 |
| `capture_codex_oauth_snapshot()` | ✅ 保留 | 捕获 OAuth 快照 |
| `read_model_provider_key()` | ✅ 保留 | 读取当前 providerKey |

## 7. 文件清单

### 7.1 完整删除的文件（15 个）

**后端 Rust**（4 个）：
```
src-tauri/src/codex_provider/mod.rs
src-tauri/src/codex_provider/config_patch.rs
src-tauri/src/codex_provider/support.rs
src-tauri/src/codex_provider/tests.rs
```

**前端 TypeScript**（5 个）：
```
src/features/settings/ui/CodexProviderListCard.tsx
src/features/settings/ui/CodexProviderDialog.tsx
src/features/settings/ui/CodexProviderDeleteDialog.tsx
src/features/settings/config/codexProviderConfig.ts
src/features/settings/config/codexProviderConfig.test.ts
```

### 7.2 需要修改的文件（16 个）

**后端 Rust**（6 个）：
```
src-tauri/src/lib.rs                    # 移除 mod codex_provider
src-tauri/src/main.rs                   # 移除 Tauri 命令注册
src-tauri/src/commands.rs               # 删除 4 个命令函数
src-tauri/src/models.rs                 # 删除类型定义
src-tauri/src/codex_auth/mod.rs         # 删除 activate_codex_provider
src-tauri/src/codex_auth/storage.rs     # 简化持久化状态
```

**前端 TypeScript**（10 个）：
```
src/bridge/hostBridgeTypes.ts           # 删除 Bridge 接口
src/bridge/tauriHostBridge.ts           # 删除实现
src/bridge/appTypes.ts                  # 删除类型定义
src/features/settings/ui/CodexAuthModeCard.tsx          # 简化
src/features/settings/ui/ConfigSettingsSection.tsx      # 重构
src/i18n/messages/zh-CN.ts              # 删除旧键，添加新键
src/i18n/messages/en-US.ts              # 删除旧键，添加新键
src/styles/replica/replica-settings-extra.css           # 删除样式
src/features/settings/ui/ConfigSettingsSection.test.tsx # 清理测试
src/features/settings/ui/SettingsView.test.tsx          # 清理测试
```

### 7.3 新增的文件（1 个）

```
src/features/settings/ui/CodexProviderRecommendationCard.tsx
```

## 8. 验收标准

### 8.1 功能验收

- [ ] 提供商 CRUD UI 完全移除
- [ ] 提供商管理后端模块完全删除
- [ ] 简化的认证模式卡片正常显示
- [ ] 当前 providerKey 正确显示（只读）
- [ ] "切换到 ChatGPT"功能正常工作
- [ ] CC Switch 推荐卡片正常显示
- [ ] 下载链接和文档链接可点击（使用 Tauri `shell::open()` API）

### 8.2 代码质量验收

- [ ] Rust 编译通过，无警告
- [ ] TypeScript 编译通过，无类型错误
- [ ] 前端测试全部通过
- [ ] Rust 测试全部通过
- [ ] 无死代码残留
- [ ] 国际化键完整更新

### 8.3 回归验证

- [ ] 设置页面其他功能不受影响
- [ ] ChatGPT 登录流程正常
- [ ] OAuth 快照机制正常
- [ ] 应用启动和关闭正常
- [ ] 无控制台错误或警告
- [ ] 已有 `codex-providers.json` 文件不影响应用运行

### 8.4 文档验收

- [ ] CLAUDE.md 更新（如需要）
- [ ] Breaking Change 说明清晰
- [ ] CC Switch 推荐说明准确
- [ ] 手动配置说明完整

### 8.5 接口边界验收

- [ ] `CodexAuthModeStateOutput` 已删除 `activeProviderId` 字段
- [ ] `CodexAuthModeStateOutput.activeProviderKey` 正确从 config.toml 读取
- [ ] `get_codex_auth_mode_state()` 已移除内置存储依赖
- [ ] `activate_codex_chatgpt()` 已移除内置存储依赖
- [ ] `persist_mode_state()` 已简化为只保存 `active_mode`
- [ ] 外部链接使用 Tauri `@tauri-apps/plugin-shell` 打开

---

**创建时间**: 2026-04-05 16:04  
**预计工时**: 6 小时  
**优先级**: P1  
**Breaking Change**: 是
