# 探索报告：删除内置提供商配置功能

## 1. 任务背景

删除 Codex App Plus 中内置的提供商配置功能，统一由官方配置文件管理。很多用户使用 CC Switch 项目管理提供商配置，内置功能会造成冲突。

## 2. CC Switch 项目分析

根据网络搜索结果，CC Switch 是一个开源的跨平台桌面工具，专门用于统一管理 AI 编码助手（Claude Code、Codex、OpenCode、Gemini CLI）的配置：

- **项目地址**: https://github.com/farion1231/cc-switch
- **核心功能**: 
  - 集中管理多个 AI 编码工具的提供商配置
  - 统一管理 MCP 服务器和系统提示词
  - 一键导入配置
  - 基于 SQLite 的配置存储
  - 支持原子写入和并发安全操作

- **工作原理**: CC Switch 直接管理 `.codex/auth.json` 和 `.codex/config.toml` 文件，提供图形化界面来切换不同的提供商配置

**冲突原因**: Codex App Plus 的内置提供商配置功能也会修改这两个文件，与 CC Switch 形成竞争关系，可能导致配置覆盖和不一致。

## 3. 当前内置提供商配置实现范围

### 3.1 后端实现 (Rust)

#### 核心模块: `src-tauri/src/codex_provider/`

**主文件 `mod.rs`**:
- `list_codex_providers()` - 列出所有保存的提供商
- `upsert_codex_provider()` - 创建或更新提供商
- `delete_codex_provider()` - 删除提供商
- `apply_codex_provider()` - 应用提供商配置到 `.codex/auth.json` 和 `.codex/config.toml`

**存储机制**:
- 存储路径: `%LOCALAPPDATA%\CodexAppPlus\codex-providers.json`
- 存储格式: JSON，包含 version 和 providers 数组
- 每个提供商记录包含: id, name, providerKey, apiKey, baseUrl, authJsonText, configTomlText, createdAt, updatedAt

**配置应用逻辑** (`config_patch.rs`):
- 解析用户保存的 auth.json 和 config.toml 模板
- 合并到当前的 `.codex/auth.json` 和 `.codex/config.toml`
- 支持原子写入（先写临时文件，再重命名）

**辅助模块**:
- `support.rs` - 工具函数（ID 生成、文件写入、路径解析）
- `config_patch.rs` - TOML 配置合并逻辑

#### 认证模式管理: `src-tauri/src/codex_auth/`

**主文件 `mod.rs`**:
- `get_codex_auth_mode_state()` - 获取当前认证模式状态
- `activate_codex_chatgpt()` - 切换到 ChatGPT 模式
- `activate_codex_provider()` - 切换到 API Key 模式（应用提供商）
- `capture_codex_oauth_snapshot()` - 捕获 OAuth 快照

**状态检测逻辑** (`live.rs`):
- 读取 `.codex/auth.json` 和 `.codex/config.toml`
- 检测当前激活的提供商（通过 model_provider 字段）
- 区分 ChatGPT 模式和 API Key 模式

**持久化状态**:
- 存储路径: `%LOCALAPPDATA%\CodexAppPlus\codex-auth-mode.json`
- 记录当前激活的模式、提供商 ID 和 providerKey

#### Tauri 命令: `src-tauri/src/commands.rs`

暴露给前端的命令:
- `app_list_codex_providers`
- `app_upsert_codex_provider`
- `app_delete_codex_provider`
- `app_apply_codex_provider`
- `app_get_codex_auth_mode_state`
- `app_activate_codex_chatgpt`
- `app_capture_codex_oauth_snapshot`

### 3.2 前端实现 (TypeScript/React)

#### 核心 UI 组件: `src/features/settings/ui/`

**`CodexProviderListCard.tsx`**:
- 显示已保存的提供商列表
- 提供"添加"、"编辑"、"删除"、"应用"操作
- 显示当前激活的提供商（带"当前"标签）

**`CodexProviderDialog.tsx`**:
- 提供商编辑对话框
- 表单字段: name, providerKey, apiKey, baseUrl, authJsonText, configTomlText
- 实时验证和双向同步（基础字段 ↔ JSON/TOML 文本）
- 支持"保存"和"保存并应用"两种操作

**`CodexProviderDeleteDialog.tsx`**:
- 删除确认对话框

**`CodexAuthModeCard.tsx`**:
- 显示当前认证模式（ChatGPT / API Key）
- 提供"切换到 ChatGPT"和"登录"按钮

**`ConfigSettingsSection.tsx`**:
- 设置页面的配置区域容器
- 协调所有提供商相关的 UI 组件
- 处理状态管理和错误提示

#### 配置逻辑: `src/features/settings/config/codexProviderConfig.ts`

**核心函数**:
- `createEmptyCodexProviderDraft()` - 创建空白提供商草稿
- `createDraftFromRecord()` - 从记录创建草稿
- `validateCodexProviderDraft()` - 验证提供商数据
- `createAuthJsonText()` - 生成 auth.json 模板
- `createConfigTomlText()` - 生成 config.toml 模板
- `normalizeConfigTomlText()` - 规范化 TOML 文本
- `readCurrentCodexProviderKey()` - 从配置快照读取当前 providerKey

**验证规则**:
- 名称、providerKey、apiKey、baseUrl 不能为空
- providerKey 不能使用保留值（openai, ollama, lmstudio）
- providerKey 不能重复
- auth.json 必须包含 OPENAI_API_KEY 且与 apiKey 字段一致
- config.toml 必须与基础字段一致

#### Bridge 层: `src/bridge/`

**`hostBridgeTypes.ts`**:
- 定义前端调用后端的接口类型
- `HostBridge.app.listCodexProviders()`
- `HostBridge.app.upsertCodexProvider()`
- `HostBridge.app.deleteCodexProvider()`
- `HostBridge.app.applyCodexProvider()`
- `HostBridge.app.getCodexAuthModeState()`
- `HostBridge.app.activateCodexChatgpt()`

**`tauriHostBridge.ts`**:
- 实现 Tauri 命令调用

### 3.3 涉及的文件清单

#### 后端文件 (需要删除或修改):
```
src-tauri/src/codex_provider/mod.rs          # 核心提供商管理逻辑
src-tauri/src/codex_provider/config_patch.rs # TOML 配置合并
src-tauri/src/codex_provider/support.rs      # 工具函数
src-tauri/src/codex_provider/tests.rs        # 单元测试
src-tauri/src/codex_auth/mod.rs              # 认证模式管理（部分功能）
src-tauri/src/codex_auth/live.rs             # 状态检测（部分功能）
src-tauri/src/codex_auth/storage.rs          # 持久化存储（部分功能）
src-tauri/src/commands.rs                    # Tauri 命令（部分）
src-tauri/src/models.rs                      # 数据模型（部分）
```

#### 前端文件 (需要删除或修改):
```
src/features/settings/ui/CodexProviderListCard.tsx      # 提供商列表 UI
src/features/settings/ui/CodexProviderDialog.tsx        # 提供商编辑对话框
src/features/settings/ui/CodexProviderDeleteDialog.tsx  # 删除确认对话框
src/features/settings/ui/CodexAuthModeCard.tsx          # 认证模式卡片（部分）
src/features/settings/ui/ConfigSettingsSection.tsx      # 配置区域容器（部分）
src/features/settings/config/codexProviderConfig.ts     # 配置逻辑
src/features/settings/config/codexProviderConfig.test.ts # 单元测试
src/bridge/hostBridgeTypes.ts                           # Bridge 类型（部分）
src/bridge/tauriHostBridge.ts                           # Bridge 实现（部分）
src/bridge/appTypes.ts                                  # 应用类型（部分）
```

#### 测试文件 (需要删除或修改):
```
src/features/settings/ui/ConfigSettingsSection.test.tsx
src/features/settings/ui/SettingsView.test.tsx
src/app/controller/useAppController.test.tsx
src/app/controller/useAppController.retry.test.tsx
src/protocol/__tests__/client.test.ts
```

#### 国际化文件 (需要删除相关键):
```
src/i18n/messages/zh-CN.ts  # settings.config.providers.* (行 374-395), settings.config.providerDialog.* (行 396-410)
src/i18n/messages/en-US.ts  # 同上
```

**需要删除的 i18n 键 (zh-CN)**:
```typescript
settings.config.providers: {
  title: "提供商配置",
  description: "保存到应用本地文件；"一键应用"只覆盖当前提供商相关 live 配置。",
  addAction: "新增提供商",
  loading: "正在加载提供商列表…",
  empty: "暂无提供商，点击"新增提供商"开始配置。",
  current: "当前已应用",
  editAction: "编辑",
  deleteAction: "删除",
  applyAction: "一键应用",
  applying: "应用中…",
  savedMessage: "已保存提供商：{name}",
  appliedMessage: "已应用提供商：{name}，重启软件后生效。",
  deletedMessage: "已删除提供商：{name}",
  deleteTitle: "删除提供商",
  deleteDescription: "将从应用本地配置中删除 {name}，不会清理现有 ~/.codex/config.toml 里的历史条目。",
  cancelAction: "取消",
  confirmDeleteAction: "确认删除",
  deleting: "删除中…",
  closeAction: "关闭",
}

settings.config.providerDialog: {
  addTitle: "新增提供商",
  editTitle: "编辑提供商",
  closeAction: "关闭",
  nameLabel: "名称",
  providerKeyLabel: "providerKey",
  providerKeyPlaceholder: "例如：openai-custom",
  apiKeyLabel: "API Key",
  baseUrlLabel: "Base URL",
  authLabel: "auth.json",
  configLabel: "config.toml",
  cancelAction: "取消",
  saveAction: "保存",
  saving: "保存中…",
  saveAndApplyAction: "保存并应用",
  applying: "应用中…",
}
```

#### CSS 文件 (需要删除相关样式):
```
src/styles/replica/replica-settings-extra.css  # .codex-provider-* 相关样式 (行 1037-1110)
```

**具体样式类**:
- `.codex-provider-card` - 提供商卡片容器
- `.codex-provider-row` - 提供商行布局
- `.codex-provider-main` - 提供商主内容区
- `.codex-provider-title-row` - 标题行
- `.codex-provider-meta-row` - 元信息行
- `.codex-provider-actions` - 操作按钮组
- `.codex-provider-current` - 当前激活标签
- `.codex-provider-dialog` - 编辑对话框
- `.codex-provider-form` - 表单容器
- `.codex-provider-form-grid` - 表单网格布局
- `.codex-provider-form-full` - 全宽表单字段
- `.codex-provider-textarea` - 文本域
- `.codex-provider-textarea-lg` - 大文本域

## 4. 与官方配置文件的交互方式

### 4.1 当前交互机制

**读取配置**:
- 通过 `read_live_files()` 读取 `.codex/auth.json` 和 `.codex/config.toml`
- 解析 `model_provider` 字段识别当前激活的提供商
- 检测 auth.json 中是否包含 `OPENAI_API_KEY` 或 OAuth 标记

**写入配置**:
- `apply_codex_provider()` 将提供商模板合并到官方配置文件
- 使用原子写入（临时文件 + 重命名）保证一致性
- 同时更新 auth.json 和 config.toml

**状态持久化**:
- 应用内状态存储在 `%LOCALAPPDATA%\CodexAppPlus\codex-auth-mode.json`
- 记录当前模式、提供商 ID 和 providerKey
- 用于在官方配置文件不明确时恢复状态

### 4.2 删除后需要保留的功能

**必须保留**:
1. **读取当前激活的提供商信息**
   - 函数: `readCurrentCodexProviderKey()` (前端)
   - 函数: `read_model_provider_key()` (后端)
   - 用途: 在 UI 中显示当前使用的提供商（只读）

2. **读取认证模式状态**
   - 函数: `get_codex_auth_mode_state()`
   - 用途: 显示当前是 ChatGPT 模式还是 API Key 模式

3. **ChatGPT 模式切换**
   - 函数: `activate_codex_chatgpt()`
   - 用途: 用户仍需要在 ChatGPT 和 API Key 之间切换
   - 注意: 这个功能不涉及提供商管理，只是切换认证方式

4. **OAuth 快照管理**
   - 函数: `capture_codex_oauth_snapshot()`
   - 用途: 在切换到 API Key 模式前保存 ChatGPT 凭证

**可以删除**:
1. 提供商的增删改操作（CRUD）
2. 提供商列表存储（codex-providers.json）
3. 应用提供商配置到官方文件的功能
4. 提供商编辑 UI 和验证逻辑
5. 提供商相关的持久化状态（codex-auth-mode.json 中的 provider_id 和 provider_key）

## 5. 删除策略建议

### 5.1 分阶段删除

**阶段 1: 删除 UI 层**
- 移除 `CodexProviderListCard`、`CodexProviderDialog`、`CodexProviderDeleteDialog`
- 从 `ConfigSettingsSection` 中移除提供商管理相关代码
- 保留 `CodexAuthModeCard`，但简化为只显示当前模式（不显示提供商详情）

**阶段 2: 删除前端逻辑层**
- 删除 `codexProviderConfig.ts` 中的 CRUD 相关函数
- 保留 `readCurrentCodexProviderKey()` 用于只读显示
- 从 Bridge 层移除提供商管理接口

**阶段 3: 删除后端实现**
- 删除 `src-tauri/src/codex_provider/` 整个模块
- 从 `codex_auth/mod.rs` 中移除 `activate_codex_provider()` 和相关逻辑
- 保留 `get_codex_auth_mode_state()` 和 `activate_codex_chatgpt()`
- 从 `commands.rs` 移除提供商管理命令

**阶段 4: 清理测试和国际化**
- 删除相关单元测试
- 移除国际化键
- 清理 CSS 样式

### 5.2 保留功能的重构

**简化认证模式显示**:
- 只显示"当前模式: ChatGPT / API Key"
- 如果是 API Key 模式，显示当前 providerKey（从 config.toml 读取）
- 提示用户使用 CC Switch 或手动编辑配置文件来管理提供商

**保留的核心函数**:
```typescript
// 前端
readCurrentCodexProviderKey(configSnapshot: unknown): string | null

// 后端
pub fn get_codex_auth_mode_state(input: GetCodexAuthModeStateInput) -> AppResult<CodexAuthModeStateOutput>
pub fn activate_codex_chatgpt(input: ActivateCodexChatgptInput) -> AppResult<CodexAuthSwitchResult>
pub fn capture_codex_oauth_snapshot(input: CaptureCodexOauthSnapshotInput) -> AppResult<CodexAuthModeStateOutput>
```

### 5.3 用户迁移指南

在删除功能前，需要提供用户迁移指南：

1. **导出现有提供商配置**
   - 提供一个"导出"功能，将 `codex-providers.json` 转换为可导入 CC Switch 的格式
   - 或者提供手动迁移说明

2. **推荐使用 CC Switch**
   - 在设置页面添加说明，推荐用户使用 CC Switch 管理提供商
   - 提供 CC Switch 的下载链接和使用文档

3. **手动配置说明**
   - 提供如何手动编辑 `.codex/auth.json` 和 `.codex/config.toml` 的文档

## 6. 潜在风险和注意事项

### 6.1 数据迁移风险
- 用户已保存的提供商配置（`codex-providers.json`）会丢失
- 需要提供导出或迁移工具

### 6.2 功能依赖风险
- 确认没有其他模块依赖提供商管理功能
- 检查 `codex_auth` 模块中的依赖关系

### 6.3 用户体验影响
- 删除内置功能后，用户需要学习使用外部工具（CC Switch）
- 需要清晰的文档和迁移指南

### 6.4 OAuth 快照机制
- 当前的 OAuth 快照机制依赖于提供商切换逻辑
- 删除后需要确保 ChatGPT ↔ API Key 切换仍然正常工作

## 7. 数据存储和持久化

### 7.1 提供商存储

**存储文件**: `%LOCALAPPDATA%\CodexAppPlus\codex-providers.json`

**数据结构**:
```json
{
  "version": 1,
  "providers": [
    {
      "id": "provider-12345-67890",
      "name": "OpenAI Custom",
      "providerKey": "openai-custom",
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "authJsonText": "{\n  \"OPENAI_API_KEY\": \"sk-...\"\n}\n",
      "configTomlText": "model_provider = \"openai-custom\"\n...",
      "createdAt": 1234567890000,
      "updatedAt": 1234567890000
    }
  ]
}
```

### 7.2 认证模式状态持久化

**存储文件**: `%LOCALAPPDATA%\CodexAppPlus\codex-auth-mode.json`

**数据结构**:
```json
{
  "active_mode": "apikey",
  "active_provider_id": "provider-12345-67890",
  "active_provider_key": "openai-custom",
  "updated_at": 1234567890000
}
```

**用途**: 记录用户最后选择的认证模式和提供商，用于在官方配置文件不明确时恢复状态。

**删除影响**: 删除提供商管理功能后，`active_provider_id` 和 `active_provider_key` 字段将不再需要，但 `active_mode` 仍需保留用于 ChatGPT/API Key 模式切换。

### 7.3 OAuth 快照存储

**存储文件**: `%LOCALAPPDATA%\CodexAppPlus\codex-oauth-snapshot.json`

**用途**: 在切换到 API Key 模式前保存 ChatGPT 的 OAuth 凭证，以便后续切换回 ChatGPT 模式时恢复。

**删除影响**: 此功能与提供商管理无关，需要完整保留。

## 8. 类型定义清单

### 8.1 需要删除的类型 (src/bridge/appTypes.ts)

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

export interface UpsertCodexProviderInput {
  readonly id?: string;
  readonly name: string;
  readonly providerKey: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly authJsonText: string;
  readonly configTomlText: string;
}

export interface DeleteCodexProviderInput {
  readonly id: string;
}

export interface ApplyCodexProviderInput {
  readonly id: string;
  readonly agentEnvironment?: AgentEnvironment;
}

export interface CodexProviderApplyResult {
  readonly providerId: string;
  readonly providerKey: string;
  readonly authPath: string;
  readonly configPath: string;
}

// 注：UpsertCodexProviderInput 在 Rust 端定义，前端使用 CodexProviderDraft
```

### 8.2 需要修改的类型

**CodexAuthModeStateOutput** (部分字段可删除):
```typescript
export interface CodexAuthModeStateOutput {
  readonly activeMode: CodexAuthMode;
  readonly activeProviderId?: string | null;  // 可删除
  readonly activeProviderKey?: string | null; // 保留（用于只读显示）
  readonly oauthSnapshotAvailable: boolean;
}
```

### 8.3 需要保留的类型

```typescript
export enum CodexAuthMode {
  Chatgpt = "chatgpt",
  Apikey = "apikey",
}

export interface CodexAuthSwitchResult {
  readonly mode: CodexAuthMode;
  readonly providerId?: string | null;
  readonly providerKey?: string | null;
  readonly authPath: string;
  readonly configPath: string;
  readonly restoredFromSnapshot: boolean;
}

export interface GetCodexAuthModeStateInput {
  readonly agentEnvironment?: AgentEnvironment;
}

export interface ActivateCodexChatgptInput {
  readonly agentEnvironment?: AgentEnvironment;
}

export interface CaptureCodexOauthSnapshotInput {
  readonly agentEnvironment?: AgentEnvironment;
}
```

## 9. 探索结论

### 9.1 实现范围总结

内置提供商配置功能涉及：
- **后端**: 完整的 CRUD 实现、配置文件合并、状态持久化
- **前端**: 完整的 UI 组件、表单验证、状态管理
- **存储**: 独立的 JSON 存储文件（codex-providers.json、codex-auth-mode.json）
- **集成**: 与认证模式管理深度耦合

**代码规模估算**:
- 后端 Rust 代码: ~1500 行（codex_provider 模块 + codex_auth 部分）
- 前端 TypeScript 代码: ~1200 行（UI 组件 + 配置逻辑 + 测试）
- CSS 样式: ~80 行
- 国际化键: ~35 个

### 9.2 删除可行性

**可行性评估**: ✅ 高度可行

- 提供商管理功能相对独立，可以安全删除
- 核心的认证模式切换功能可以保留
- 只读显示当前提供商信息的功能可以保留
- 与 CC Switch 的功能定位完全重叠，删除后不影响用户工作流

### 9.3 推荐方案

1. **完全删除提供商 CRUD 功能**
   - 删除增删改查 UI 和后端实现
   - 删除 codex-providers.json 存储

2. **保留只读显示功能**
   - 保留 `readCurrentCodexProviderKey()` 函数
   - 在设置页面显示当前激活的 providerKey（只读）

3. **保留 ChatGPT 模式切换功能**
   - 保留 `activate_codex_chatgpt()`
   - 保留 OAuth 快照机制
   - 简化 codex-auth-mode.json，只保留 active_mode 字段

4. **提供迁移指南**
   - 在设置页面添加说明，推荐使用 CC Switch
   - 提供 CC Switch 的下载链接和使用文档
   - 可选：提供一次性导出工具，将现有提供商配置导出为文本格式

5. **UI 重构**
   - 删除提供商列表卡片
   - 简化认证模式卡片，只显示当前模式和 providerKey
   - 添加"使用 CC Switch 管理提供商"的提示和链接

### 9.4 下一步行动

建议 spec-writer 基于本报告创建 `plan.md`，包含：

1. **详细的删除步骤和文件清单**
   - 按模块分组的文件删除列表
   - 需要修改的文件和具体修改点

2. **保留功能的重构方案**
   - 简化后的认证模式显示 UI
   - 只读 providerKey 显示逻辑
   - 简化后的 codex-auth-mode.json 结构

3. **用户迁移指南的内容设计**
   - CC Switch 介绍和下载链接
   - 手动配置 .codex/auth.json 和 config.toml 的说明
   - 可选的导出工具设计

4. **测试计划**
   - 确保删除后 ChatGPT 模式切换正常工作
   - 确保只读显示当前 providerKey 正常
   - 确保不影响其他设置功能
   - 回归测试认证流程

5. **版本发布说明**
   - Breaking Change 说明
   - 迁移指南链接
   - CC Switch 推荐说明

---

**探索完成时间**: 2026-04-05  
**探索人员**: spec-explorer (Claude)  
**参考资料**:
- [CC Switch - All-in-One AI CLI Management Tool](https://docs.newapi.ai/en/docs/apps/cc-switch)
- [CC-Switch Complete Guide](https://help.apiyi.com/en/cc-switch-beginner-guide-en.html)
- [farion1231/cc-switch GitHub](https://github.com/farion1231/cc-switch)
