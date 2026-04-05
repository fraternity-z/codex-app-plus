---
type: test-plan
status: pending
created: 2026-04-05T16:30:00+08:00
related_docs:
  - plan.md
  - exploration-report.md
---

# 删除内置提供商配置功能 - 测试计划

## 1. 测试目标

验证删除内置提供商配置功能后：
1. 保留的功能（ChatGPT 模式切换、只读显示）正常工作
2. 删除的功能完全移除，无残留代码或 UI
3. 不影响现有用户的配置文件和工作流
4. 新增的 CC Switch 推荐功能正常显示

## 2. 测试范围

### 2.1 功能测试范围

**删除验证**：
- 提供商 CRUD UI 完全移除
- 提供商管理后端接口不可访问
- 相关国际化键和样式已清理

**保留功能验证**：
- 读取当前 providerKey（只读显示）
- ChatGPT ↔ API Key 模式切换
- OAuth 快照捕获和恢复

**新增功能验证**：
- CC Switch 推荐卡片显示
- 外部链接打开

### 2.2 回归测试范围

- 设置页面其他功能
- ChatGPT 登录流程
- 应用启动和关闭
- 配置文件读写

## 3. 接口边界确认

### 3.1 保留的 Bridge 接口

基于代码审查，确认以下接口**必须保留**：

```typescript
// src/bridge/hostBridgeTypes.ts
readonly app: {
  // 保留 - 读取认证模式状态（包含 activeProviderKey）
  getCodexAuthModeState(input: GetCodexAuthModeStateInput): Promise<CodexAuthModeStateOutput>;
  
  // 保留 - 切换到 ChatGPT 模式
  activateCodexChatgpt(input: ActivateCodexChatgptInput): Promise<CodexAuthSwitchResult>;
  
  // 保留 - 捕获 OAuth 快照
  captureCodexOauthSnapshot(input: CaptureCodexOauthSnapshotInput): Promise<CodexAuthModeStateOutput>;
}
```

**删除的接口**：
```typescript
// 删除 - 提供商 CRUD 接口
listCodexProviders(): Promise<CodexProviderStore>;
upsertCodexProvider(input: CodexProviderDraft): Promise<CodexProviderRecord>;
deleteCodexProvider(input: DeleteCodexProviderInput): Promise<void>;
applyCodexProvider(input: ApplyCodexProviderInput): Promise<CodexProviderApplyResult>;
```

### 3.2 简化的数据模型

**CodexAuthModeStateOutput 简化**：

```typescript
// 修改前
export interface CodexAuthModeStateOutput {
  readonly activeMode: CodexAuthMode;
  readonly activeProviderId: string | null;      // 删除
  readonly activeProviderKey: string | null;     // 保留
  readonly oauthSnapshotAvailable: boolean;
}

// 修改后
export interface CodexAuthModeStateOutput {
  readonly activeMode: CodexAuthMode;
  readonly activeProviderKey: string | null;     // 保留 - 用于只读显示
  readonly oauthSnapshotAvailable: boolean;
}
```

**理由**：
- `activeProviderId` 依赖内置提供商存储，删除后无意义
- `activeProviderKey` 从 `.codex/config.toml` 读取，独立于内置存储，必须保留用于 UI 显示

### 3.3 后端函数保留

**codex_auth/live.rs**：
```rust
// 保留 - 从 config.toml 读取当前 providerKey
pub(crate) fn read_model_provider_key(config_table: &Table) -> Option<String>
```

**codex_auth/mod.rs**：
```rust
// 保留
pub fn get_codex_auth_mode_state(input: GetCodexAuthModeStateInput) -> AppResult<CodexAuthModeStateOutput>
pub fn activate_codex_chatgpt(input: ActivateCodexChatgptInput) -> AppResult<CodexAuthSwitchResult>
pub fn capture_codex_oauth_snapshot(input: CaptureCodexOauthSnapshotInput) -> AppResult<CodexAuthModeStateOutput>

// 删除 - 依赖 codex_provider 模块
pub fn activate_codex_provider(input: ApplyCodexProviderInput) -> AppResult<CodexProviderApplyResult>
```

### 3.4 CC Switch 推荐卡片外部链接

**链接打开方式**：使用 Tauri 的 `shell::open()` API 在系统默认浏览器中打开

**链接地址**：
- 下载链接：`https://github.com/farion1231/cc-switch`
- 文档链接：`https://docs.newapi.ai/en/docs/apps/cc-switch`

**实现方式**：
```typescript
// 前端调用
await HostBridge.app.openExternalUrl('https://github.com/farion1231/cc-switch');
```

## 4. 测试用例

### 4.1 删除验证测试

#### TC-DEL-001: 提供商列表 UI 已移除
**前置条件**：应用已启动
**步骤**：
1. 打开设置页面
2. 查看配置区域

**预期结果**：
- 不显示"提供商配置"卡片
- 不显示提供商列表
- 不显示"新增提供商"按钮

#### TC-DEL-002: 提供商编辑对话框已移除
**前置条件**：应用已启动
**步骤**：
1. 检查 DOM 结构
2. 搜索 `CodexProviderDialog` 相关类名

**预期结果**：
- 不存在提供商编辑对话框
- 不存在相关 CSS 类（`.codex-provider-dialog`）

#### TC-DEL-003: 后端接口已删除
**前置条件**：开发环境
**步骤**：
1. 检查 `src-tauri/src/commands.rs`
2. 检查 `src-tauri/src/main.rs` 的 `invoke_handler`

**预期结果**：
- 不存在 `app_list_codex_providers` 命令
- 不存在 `app_upsert_codex_provider` 命令
- 不存在 `app_delete_codex_provider` 命令
- 不存在 `app_apply_codex_provider` 命令

#### TC-DEL-004: 国际化键已清理
**前置条件**：开发环境
**步骤**：
1. 检查 `src/i18n/messages/zh-CN.ts`
2. 搜索 `settings.config.providers`
3. 搜索 `settings.config.providerDialog`

**预期结果**：
- 不存在 `settings.config.providers.*` 命名空间
- 不存在 `settings.config.providerDialog.*` 命名空间

#### TC-DEL-005: CSS 样式已清理
**前置条件**：开发环境
**步骤**：
1. 检查 `src/styles/replica/replica-settings-extra.css`
2. 搜索 `.codex-provider-`

**预期结果**：
- 不存在 `.codex-provider-card` 样式
- 不存在 `.codex-provider-dialog` 样式
- 不存在其他 `.codex-provider-*` 样式

### 4.2 保留功能测试

#### TC-KEEP-001: 读取当前 providerKey（API Key 模式）
**前置条件**：
- `.codex/config.toml` 包含 `model_provider = "openai-custom"`
- `.codex/auth.json` 包含 `OPENAI_API_KEY`

**步骤**：
1. 启动应用
2. 打开设置页面
3. 查看认证模式卡片

**预期结果**：
- 显示"当前模式: API Key"
- 显示"提供商: openai-custom"（只读）

#### TC-KEEP-002: 读取当前 providerKey（ChatGPT 模式）
**前置条件**：
- `.codex/config.toml` 不包含 `model_provider` 或为空
- `.codex/auth.json` 包含 OAuth tokens

**步骤**：
1. 启动应用
2. 打开设置页面
3. 查看认证模式卡片

**预期结果**：
- 显示"当前模式: ChatGPT"
- 不显示提供商信息

#### TC-KEEP-003: 切换到 ChatGPT 模式（有快照）
**前置条件**：
- 当前为 API Key 模式
- 存在 OAuth 快照（`codex-oauth-snapshot.json`）

**步骤**：
1. 打开设置页面
2. 点击"切换到 ChatGPT"按钮
3. 等待切换完成

**预期结果**：
- 按钮显示"切换中…"
- 切换成功后显示"当前模式: ChatGPT"
- `.codex/auth.json` 恢复为 OAuth tokens
- `.codex/config.toml` 移除 `model_provider`

#### TC-KEEP-004: 切换到 ChatGPT 模式（无快照）
**前置条件**：
- 当前为 API Key 模式
- 不存在 OAuth 快照

**步骤**：
1. 打开设置页面
2. 点击"切换到 ChatGPT"按钮
3. 等待切换完成

**预期结果**：
- 切换成功后显示"当前模式: ChatGPT"
- 显示"需要登录"提示
- `.codex/auth.json` 清空 API Key
- `.codex/config.toml` 移除 `model_provider`

#### TC-KEEP-005: OAuth 快照捕获
**前置条件**：
- 当前为 ChatGPT 模式
- 已登录 ChatGPT

**步骤**：
1. 切换到 API Key 模式（通过手动编辑配置文件）
2. 验证快照文件存在

**预期结果**：
- 生成 `codex-oauth-snapshot.json` 文件
- 快照包含 OAuth tokens 和 config.toml 内容

### 4.3 新增功能测试

#### TC-NEW-001: CC Switch 推荐卡片显示
**前置条件**：应用已启动
**步骤**：
1. 打开设置页面
2. 查看配置区域

**预期结果**：
- 显示"提供商配置管理"卡片
- 显示推荐说明文本
- 显示"下载 CC Switch"按钮
- 显示"查看文档"按钮
- 显示手动配置说明

#### TC-NEW-002: 下载链接打开
**前置条件**：应用已启动
**步骤**：
1. 打开设置页面
2. 点击"下载 CC Switch"按钮

**预期结果**：
- 系统默认浏览器打开
- 跳转到 `https://github.com/farion1231/cc-switch`

#### TC-NEW-003: 文档链接打开
**前置条件**：应用已启动
**步骤**：
1. 打开设置页面
2. 点击"查看文档"按钮

**预期结果**：
- 系统默认浏览器打开
- 跳转到 `https://docs.newapi.ai/en/docs/apps/cc-switch`

#### TC-NEW-004: 国际化支持
**前置条件**：应用已启动
**步骤**：
1. 切换语言到中文
2. 查看 CC Switch 推荐卡片
3. 切换语言到英文
4. 再次查看卡片

**预期结果**：
- 中文显示正确
- 英文显示正确
- 链接地址不变

### 4.4 回归测试

#### TC-REG-001: ChatGPT 登录流程
**前置条件**：当前为 ChatGPT 模式，未登录
**步骤**：
1. 打开设置页面
2. 点击"登录"按钮
3. 完成 OAuth 流程

**预期结果**：
- OAuth 流程正常启动
- 登录成功后状态更新
- 显示"ChatGPT (已登录)"

#### TC-REG-002: 设置页面其他功能
**前置条件**：应用已启动
**步骤**：
1. 打开设置页面
2. 测试其他设置项（主题、语言、代理等）

**预期结果**：
- 所有其他设置功能正常工作
- 无控制台错误

#### TC-REG-003: 应用启动性能
**前置条件**：应用已关闭
**步骤**：
1. 启动应用
2. 记录启动时间

**预期结果**：
- 启动时间不增加（删除代码应略微提升性能）
- 无启动错误

#### TC-REG-004: 配置文件读取
**前置条件**：
- `.codex/auth.json` 存在
- `.codex/config.toml` 存在

**步骤**：
1. 启动应用
2. 检查配置读取日志

**预期结果**：
- 配置文件正确读取
- 无读取错误

#### TC-REG-005: 已有 codex-providers.json 文件处理
**前置条件**：
- 用户本地存在 `%LOCALAPPDATA%\CodexAppPlus\codex-providers.json`

**步骤**：
1. 启动应用
2. 打开设置页面

**预期结果**：
- 应用正常启动
- 不尝试读取或删除该文件
- 不显示任何错误
- 文件保持原样（用户可手动清理）

### 4.5 边界测试

#### TC-EDGE-001: 空 config.toml
**前置条件**：`.codex/config.toml` 为空或不存在
**步骤**：
1. 启动应用
2. 打开设置页面

**预期结果**：
- 显示"当前模式: ChatGPT"
- 不显示提供商信息
- 无错误

#### TC-EDGE-002: 无效的 providerKey
**前置条件**：`.codex/config.toml` 包含 `model_provider = "invalid-key"`
**步骤**：
1. 启动应用
2. 打开设置页面

**预期结果**：
- 显示"当前模式: API Key"
- 显示"提供商: invalid-key"（只读）
- 无错误

#### TC-EDGE-003: 同时存在 API Key 和 OAuth tokens
**前置条件**：
- `.codex/auth.json` 同时包含 `OPENAI_API_KEY` 和 OAuth tokens
- `.codex/config.toml` 包含 `model_provider`

**步骤**：
1. 启动应用
2. 打开设置页面

**预期结果**：
- 优先识别为 API Key 模式（根据 `model_provider` 判断）
- 显示对应的 providerKey

## 5. 性能验证

### 5.1 启动速度
**测试方法**：
- 删除前后对比应用启动时间
- 测量从启动到主界面显示的时间

**验收标准**：
- 启动时间不增加
- 理想情况下略微减少（删除了代码和存储读取）

### 5.2 内存占用
**测试方法**：
- 删除前后对比应用内存占用
- 使用任务管理器或性能分析工具

**验收标准**：
- 内存占用不增加
- 理想情况下略微减少

### 5.3 设置页面渲染
**测试方法**：
- 测量设置页面打开速度
- 测量认证模式卡片渲染时间

**验收标准**：
- 渲染速度不降低
- 无明显卡顿

## 6. 兼容性测试

### 6.1 现有用户配置
**测试场景**：
- 用户已有 `.codex/auth.json` 和 `.codex/config.toml`
- 用户已有 `codex-providers.json`（内置存储）

**验收标准**：
- 官方配置文件不受影响
- 内置存储文件不被自动删除
- 应用正常读取官方配置

### 6.2 多环境支持
**测试场景**：
- 默认环境（default）
- 自定义环境（custom agent environment）

**验收标准**：
- 所有环境下功能正常
- 正确读取对应环境的配置文件

## 7. 测试环境

### 7.1 开发环境
- Node.js: 18+
- pnpm: 8+
- Rust: 1.70+
- Tauri: 2.x

### 7.2 运行环境
- Windows 10/11
- 不同的 `.codex` 配置状态

## 8. 测试执行计划

### 8.1 单元测试
**执行命令**：
```bash
# 前端测试
pnpm test

# Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml
```

**验收标准**：
- 所有测试通过
- 无提供商相关的测试残留

### 8.2 类型检查
**执行命令**：
```bash
pnpm run typecheck
```

**验收标准**：
- 无类型错误
- 无未使用的导入

### 8.3 编译检查
**执行命令**：
```bash
# Rust 编译
cargo build --manifest-path src-tauri/Cargo.toml

# 前端构建
pnpm run build
```

**验收标准**：
- 编译成功
- 无警告

### 8.4 手动测试
**执行方式**：
- 按照测试用例逐项验证
- 记录测试结果

**验收标准**：
- 所有测试用例通过
- 无控制台错误

## 9. 缺陷管理

### 9.1 缺陷优先级

| 优先级 | 定义 | 处理方式 |
|--------|------|----------|
| P0 | 阻塞性缺陷，导致应用无法启动或崩溃 | 立即修复 |
| P1 | 严重缺陷，核心功能不可用 | 当天修复 |
| P2 | 一般缺陷，功能部分不可用 | 3 天内修复 |
| P3 | 轻微缺陷，UI 显示问题 | 可延后修复 |

### 9.2 缺陷报告模板

```markdown
**缺陷标题**：[简短描述]

**优先级**：P0/P1/P2/P3

**复现步骤**：
1. ...
2. ...

**预期结果**：...

**实际结果**：...

**环境信息**：
- OS: Windows 10/11
- 应用版本: ...
- 配置状态: ...

**附加信息**：
- 控制台错误日志
- 截图
```

## 10. 测试报告模板

### 10.1 测试执行摘要

| 测试类型 | 计划用例数 | 执行用例数 | 通过数 | 失败数 | 通过率 |
|----------|-----------|-----------|--------|--------|--------|
| 删除验证 | 5 | - | - | - | - |
| 保留功能 | 5 | - | - | - | - |
| 新增功能 | 4 | - | - | - | - |
| 回归测试 | 5 | - | - | - | - |
| 边界测试 | 3 | - | - | - | - |
| **总计** | **22** | - | - | - | - |

### 10.2 缺陷统计

| 优先级 | 发现数 | 已修复 | 待修复 | 延后修复 |
|--------|--------|--------|--------|----------|
| P0 | - | - | - | - |
| P1 | - | - | - | - |
| P2 | - | - | - | - |
| P3 | - | - | - | - |
| **总计** | - | - | - | - |

### 10.3 测试结论

**测试是否通过**：是 / 否

**主要问题**：
- [列出主要问题]

**建议**：
- [列出改进建议]

---

**创建时间**: 2026-04-05 16:30  
**创建人员**: spec-tester (Claude)  
**关联文档**: plan.md, exploration-report.md
