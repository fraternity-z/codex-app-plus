---
id: KNOW-002
title: Codex App Plus 内置提供商配置功能架构
type: 项目理解
keywords: [codex_provider, 提供商管理, Bridge 接口, 配置合并, 原子写入]
created: 2026-04-05
---

# Codex App Plus 内置提供商配置功能架构

## 概述

Codex App Plus 内置提供商配置功能是一个完整的前后端系统，允许用户在应用内管理 Codex 的 API 提供商配置。该功能包含约 2700 行代码（后端 ~1500 行 Rust，前端 ~1200 行 TypeScript），涉及 30+ 个文件。

本文档详细记录了该功能的完整架构，包括后端 Rust 模块、前端 TypeScript 组件、数据流、存储机制、与其他模块的耦合关系，以及与 CC Switch 的冲突分析。

**注**：该功能已在 2026-04-05 被完全删除，本文档作为历史记录保留。

## 后端架构（Rust）

### codex_provider 模块（~1500 行）

#### 模块结构

```
src-tauri/src/codex_provider/
├── mod.rs              # 核心 CRUD 逻辑
├── config_patch.rs     # TOML 配置合并算法
├── support.rs          # 工具函数
└── tests.rs            # 单元测试
```

#### mod.rs - 核心 CRUD 逻辑

**主要函数**：

1. **list_codex_providers()** - 列出所有保存的提供商
   - 读取 `codex-providers.json` 文件
   - 返回 `CodexProviderStore` 结构
   - 验证存储版本和数据完整性

2. **upsert_codex_provider()** - 创建或更新提供商
   - 验证输入数据（name, providerKey, apiKey, baseUrl）
   - 生成或使用现有 ID
   - 确保 providerKey 唯一性
   - 更新时间戳（createdAt, updatedAt）
   - 原子写入到存储文件

3. **delete_codex_provider()** - 删除提供商
   - 根据 ID 删除提供商记录
   - 更新存储文件
   - 返回错误如果提供商不存在

4. **apply_codex_provider()** - 应用提供商配置到官方文件
   - 读取提供商的 auth.json 和 config.toml 模板
   - 合并到当前的 `.codex/auth.json` 和 `.codex/config.toml`
   - 使用原子写入确保安全性
   - 返回应用结果（providerKey, 文件路径）

#### config_patch.rs - TOML 配置合并算法

**主要函数**：

1. **parse_config_table()** - 解析 TOML 配置
   - 将 TOML 文本解析为 `Table` 结构
   - 错误处理和验证

2. **build_provider_patch_from_text()** - 构建提供商配置补丁
   - 从用户保存的 config.toml 模板提取提供商配置
   - 更新 name 和 base_url 字段
   - 确保默认值（wire_api, requires_openai_auth）
   - 返回可合并的配置补丁

3. **merge_config_table()** - 合并配置表
   - 将模板配置合并到当前配置
   - 特殊处理 `model_providers` 字段（完全替换）
   - 保留其他字段

**配置合并策略**：
- `model_provider` 字段：直接替换为新值
- `model_providers` 字段：完全替换（不合并）
- 其他字段：保留原值，添加新字段

#### support.rs - 工具函数

**主要函数**：

1. **generate_provider_id()** - 生成唯一 ID
   - 使用 UUID v4 生成
   - 格式：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

2. **write_live_files()** - 原子写入配置文件
   - 先写入临时文件（`.tmp` 后缀）
   - 验证写入成功
   - 重命名临时文件为目标文件（原子操作）
   - 确保配置文件不会损坏

3. **store_path()** - 解析存储路径
   - 获取应用数据目录（`%LOCALAPPDATA%\CodexAppPlus`）
   - 拼接文件名
   - 返回完整路径

4. **now_unix_ms()** - 获取当前时间戳
   - 返回 Unix 毫秒时间戳
   - 用于 createdAt 和 updatedAt 字段

### 存储机制

#### 存储文件

- **路径**：`%LOCALAPPDATA%\CodexAppPlus\codex-providers.json`
- **格式**：JSON
- **结构**：
  ```json
  {
    "version": 1,
    "providers": [
      {
        "id": "uuid",
        "name": "提供商名称",
        "providerKey": "provider-key",
        "apiKey": "sk-xxx",
        "baseUrl": "https://api.example.com/v1",
        "authJsonText": "{\"OPENAI_API_KEY\":\"sk-xxx\"}",
        "configTomlText": "model_provider = \"provider-key\"\n...",
        "createdAt": 1234567890000,
        "updatedAt": 1234567890000
      }
    ]
  }
  ```

#### 数据验证

- **版本检查**：确保 version 字段为 1
- **唯一性检查**：确保 id 和 providerKey 唯一
- **内容验证**：
  - authJsonText 必须是有效的 JSON 对象
  - authJsonText 必须包含 `OPENAI_API_KEY` 字段
  - configTomlText 必须是有效的 TOML
  - apiKey 必须与 authJsonText 中的 `OPENAI_API_KEY` 一致

### 配置应用流程

```
用户点击"应用"按钮
    ↓
调用 apply_codex_provider(providerId)
    ↓
读取提供商记录
    ↓
解析 authJsonText 和 configTomlText
    ↓
读取当前的 .codex/auth.json 和 .codex/config.toml
    ↓
合并配置（auth: 合并对象，config: 替换 model_providers）
    ↓
原子写入（临时文件 + 重命名）
    ↓
返回应用结果
```

## 前端架构（TypeScript/React）

### UI 组件（~1200 行）

#### CodexProviderListCard - 提供商列表

**位置**：`src/features/settings/ui/CodexProviderListCard.tsx`

**功能**：
- 显示已保存的提供商列表
- 每个提供商显示：name, providerKey, baseUrl
- 当前激活的提供商显示"当前"标签
- 操作按钮：
  - "添加提供商"：打开编辑对话框（新建模式）
  - "编辑"：打开编辑对话框（编辑模式）
  - "删除"：打开删除确认对话框
  - "应用"：应用提供商配置到官方文件

**状态管理**：
- 使用 `useQuery` 获取提供商列表
- 使用 `useMutation` 处理应用操作
- 使用 `useState` 管理对话框状态

#### CodexProviderDialog - 编辑对话框

**位置**：`src/features/settings/ui/CodexProviderDialog.tsx`

**功能**：
- 表单字段：
  - name：提供商名称
  - providerKey：提供商标识符（如 `openai-custom`）
  - apiKey：API 密钥
  - baseUrl：API 基础 URL
  - authJsonText：auth.json 文本（高级）
  - configTomlText：config.toml 文本（高级）
- 实时验证：
  - name 不能为空
  - providerKey 不能为空，不能使用保留值（`openai`, `ollama`, `lmstudio`）
  - apiKey 不能为空
  - baseUrl 不能为空
  - authJsonText 必须是有效的 JSON，且包含 `OPENAI_API_KEY`
  - configTomlText 必须是有效的 TOML，且与基础字段一致
- 双向同步：
  - 修改基础字段（name, providerKey, apiKey, baseUrl）自动更新 JSON/TOML 文本
  - 修改 JSON/TOML 文本自动更新基础字段（如果解析成功）
- 操作按钮：
  - "保存"：保存提供商但不应用
  - "保存并应用"：保存提供商并立即应用到官方文件

**状态管理**：
- 使用 `useState` 管理表单状态
- 使用 `useMemo` 计算验证错误
- 使用 `useMutation` 处理保存操作

#### CodexProviderDeleteDialog - 删除确认对话框

**位置**：`src/features/settings/ui/CodexProviderDeleteDialog.tsx`

**功能**：
- 显示提供商名称
- 确认删除操作
- 操作按钮：
  - "取消"：关闭对话框
  - "删除"：执行删除操作

### 配置逻辑

#### codexProviderConfig.ts - 验证、解析、生成配置

**位置**：`src/features/settings/config/codexProviderConfig.ts`

**主要函数**：

1. **createAuthJsonText()** - 生成 auth.json 文本
   ```typescript
   createAuthJsonText(apiKey: string): string
   // 返回：{"OPENAI_API_KEY": "sk-xxx"}
   ```

2. **createConfigTomlText()** - 生成 config.toml 文本
   ```typescript
   createConfigTomlText(input: ConfigTomlBasicsInput): string
   // 返回：model_provider = "provider-key"\n[model_providers.provider-key]\n...
   ```

3. **validateCodexProviderDraft()** - 验证提供商草稿
   ```typescript
   validateCodexProviderDraft(
     draft: CodexProviderDraft,
     providers: ReadonlyArray<CodexProviderRecord>
   ): CodexProviderValidationErrors
   ```
   - 验证所有字段
   - 检查 providerKey 唯一性
   - 检查 authJsonText 与 apiKey 一致性
   - 检查 configTomlText 与基础字段一致性

4. **extractApiKeyFromAuthJson()** - 从 auth.json 提取 API Key
   ```typescript
   extractApiKeyFromAuthJson(authJsonText: string): string
   ```

5. **extractCodexConfigFields()** - 从 config.toml 提取配置字段
   ```typescript
   extractCodexConfigFields(configTomlText: string): CodexConfigFields
   // 返回：{ providerKey, providerName, baseUrl }
   ```

6. **normalizeConfigTomlText()** - 规范化 config.toml 文本
   ```typescript
   normalizeConfigTomlText(
     configTomlText: string,
     input: ConfigTomlBasicsInput
   ): string
   ```
   - 解析现有配置
   - 更新基础字段
   - 确保默认值
   - 返回规范化的文本

**双向同步机制**：
- 基础字段 → JSON/TOML：使用 `createAuthJsonText()` 和 `createConfigTomlText()`
- JSON/TOML → 基础字段：使用 `extractApiKeyFromAuthJson()` 和 `extractCodexConfigFields()`

### Bridge 接口

**位置**：`src/bridge/hostBridgeTypes.ts`

**接口定义**：

```typescript
readonly app: {
  // 列出提供商
  listCodexProviders(): Promise<CodexProviderStore>;
  
  // 创建或更新提供商
  upsertCodexProvider(input: CodexProviderDraft): Promise<CodexProviderRecord>;
  
  // 删除提供商
  deleteCodexProvider(input: DeleteCodexProviderInput): Promise<void>;
  
  // 应用提供商配置
  applyCodexProvider(input: ApplyCodexProviderInput): Promise<CodexProviderApplyResult>;
}
```

**类型定义**：

```typescript
export interface CodexProviderDraft {
  readonly id: string | null;
  readonly name: string;
  readonly providerKey: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly authJsonText: string;
  readonly configTomlText: string;
}

export interface CodexProviderRecord {
  readonly id: string;
  readonly name: string;
  readonly providerKey: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly authJsonText: string;
  readonly configTomlText: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CodexProviderStore {
  readonly version: number;
  readonly providers: ReadonlyArray<CodexProviderRecord>;
}
```

## 与 codex_auth 的耦合

### 深度耦合点

1. **codex_auth 模块依赖 codex_provider 存储**
   - `activate_codex_provider()` 函数调用 `apply_codex_provider()`
   - 认证模式状态包含 `activeProviderId` 字段（指向内置存储）

2. **持久化状态文件**
   - 路径：`%LOCALAPPDATA%\CodexAppPlus\codex-auth-mode.json`
   - 内容：
     ```json
     {
       "active_mode": "api_key",
       "active_provider_id": "uuid",
       "active_provider_key": "provider-key"
     }
     ```

3. **认证模式切换流程**
   ```
   用户点击"切换到 API Key 模式"
       ↓
   调用 activate_codex_provider(providerId)
       ↓
   应用提供商配置（调用 apply_codex_provider）
       ↓
   更新认证模式状态（写入 codex-auth-mode.json）
       ↓
   返回新的认证模式状态
   ```

### 耦合影响

删除 `codex_provider` 模块需要同时简化 `codex_auth` 模块：

1. **删除函数**：
   - `activate_codex_provider()` - 依赖提供商存储

2. **简化类型**：
   - `CodexAuthModeStateOutput` - 删除 `activeProviderId` 字段
   - `PersistedModeState` - 删除 `active_provider_id` 和 `active_provider_key` 字段

3. **保留函数**：
   - `get_codex_auth_mode_state()` - 读取认证模式状态（从官方配置文件）
   - `activate_codex_chatgpt()` - 切换到 ChatGPT 模式
   - `capture_codex_oauth_snapshot()` - 捕获 OAuth 快照

## 与 CC Switch 的冲突

### 冲突原因

1. **直接修改相同的配置文件**
   - 两者都修改 `.codex/auth.json` 和 `.codex/config.toml`
   - 没有协调机制，后写入的会覆盖先写入的

2. **功能定位完全重叠**
   - 都提供提供商配置管理功能
   - 都支持切换不同的 API 提供商
   - 用户不知道应该使用哪个工具

3. **用户体验混乱**
   - 在 Codex App Plus 中配置的提供商，CC Switch 看不到
   - 在 CC Switch 中配置的提供商，Codex App Plus 看不到
   - 两者切换提供商会互相覆盖配置

### CC Switch 优势

1. **跨平台桌面工具**
   - 支持 Windows, macOS, Linux
   - 独立运行，不依赖特定应用

2. **多工具统一管理**
   - 支持 Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw
   - 一个工具管理所有 AI 编码助手的配置

3. **更可靠的存储**
   - 基于 SQLite 的配置存储
   - 支持原子写入和并发安全操作
   - 自动备份和恢复

4. **更丰富的功能**
   - 统一管理 MCP 服务器
   - 统一管理系统提示词（CLAUDE.md, AGENTS.md, GEMINI.md）
   - 支持配置导入导出
   - 支持 Deep Link 导入

### 解决方案

**决策**：删除 Codex App Plus 内置提供商配置功能

**理由**：
1. 避免与 CC Switch 冲突
2. CC Switch 功能更专业和完善
3. 减少 Codex App Plus 的维护负担
4. 用户可以选择使用 CC Switch 或手动编辑配置文件

**实施方案**：
1. 删除 `codex_provider` 模块和相关 UI 组件
2. 保留只读显示当前 providerKey 的功能
3. 在设置页面添加 CC Switch 推荐卡片
4. 提供手动配置文档链接

## 相关文档

### Spec 文档
- [exploration-report.md](../../03-功能实现/20260405-1604-删除内置提供商配置/exploration-report.md) - 探索报告
- [plan.md](../../03-功能实现/20260405-1604-删除内置提供商配置/plan.md) - 删除计划
- [summary.md](../../03-功能实现/20260405-1604-删除内置提供商配置/summary.md) - 删除总结

### 关键文件（已删除）
- `src-tauri/src/codex_provider/mod.rs` - 后端核心逻辑
- `src-tauri/src/codex_provider/config_patch.rs` - 配置合并算法
- `src/features/settings/ui/CodexProviderDialog.tsx` - 编辑对话框
- `src/features/settings/ui/CodexProviderListCard.tsx` - 提供商列表
- `src/features/settings/config/codexProviderConfig.ts` - 配置逻辑

### 替代方案
- [CC Switch 项目](https://github.com/farion1231/cc-switch) - 推荐的提供商管理工具
- [CC Switch 文档](https://docs.newapi.ai/en/docs/apps/cc-switch) - 使用指南

## 参考

- Codex App Plus 项目架构
- Tauri 2 框架文档
- TOML 配置格式规范
- 原子写入模式（临时文件 + 重命名）
