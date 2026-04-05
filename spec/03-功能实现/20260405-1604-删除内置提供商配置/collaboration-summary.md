---
type: collaboration-summary
status: completed
created: 2026-04-05T16:40:00+08:00
participants:
  - spec-writer
  - spec-tester
related_docs:
  - plan.md
  - exploration-report.md
  - test-plan.md
  - interface-boundary-review.md
---

# spec-writer 与 spec-tester 协作总结

## 1. 协作目标

基于 spec-writer 完成的 plan.md 草稿，spec-tester 参与讨论接口边界和验收标准，共同完成：
1. 接口边界确认
2. 验收标准补充
3. 测试计划创建

## 2. spec-writer 提出的关键问题

### 问题 1: 保留的 Bridge 接口是否足够？是否需要新增接口读取 providerKey？

**spec-tester 回答**：
- ✅ **现有接口足够，无需新增**
- `getCodexAuthModeState()` 返回的 `CodexAuthModeStateOutput` 已包含 `activeProviderKey` 字段
- 该字段通过后端 `read_model_provider_key()` 从 `.codex/config.toml` 读取
- 数据流完整：config.toml → read_model_provider_key() → CodexAuthModeStateOutput → UI

**spec-writer 确认**：接受建议，无需新增接口。

---

### 问题 2: 简化的 `CodexAuthModeStateOutput` 删除 `activeProviderId` 后是否影响现有功能？

**spec-tester 回答**：
- ✅ **不影响，可以安全删除**
- `activeProviderId` 依赖内置提供商存储，删除后失去数据源
- 前端 UI 从未直接使用该字段（只使用 `activeProviderKey`）
- 后端仅用于内部状态持久化，删除后简化持久化逻辑即可

**影响评估**：
- ✅ 前端 UI：无影响
- ✅ 后端逻辑：无影响
- ✅ 类型安全：需同步更新 Rust 和 TypeScript 类型定义

**spec-writer 确认**：接受建议，删除 `activeProviderId` 字段。

---

### 问题 3: CC Switch 推荐卡片的外部链接打开方式？

**spec-tester 回答**：
- ✅ **使用 Tauri `@tauri-apps/plugin-shell` 的 `open()` API**
- Tauri 官方推荐方案，安全且跨平台
- 无需新增 Bridge 接口，前端直接调用 Tauri API

**推荐实现**：
```typescript
import { open } from '@tauri-apps/plugin-shell';

async function openCcSwitchDownload() {
  await open('https://github.com/farion1231/cc-switch');
}
```

**链接地址**：
- 下载链接：`https://github.com/farion1231/cc-switch`
- 文档链接：`https://docs.newapi.ai/en/docs/apps/cc-switch`

**spec-writer 确认**：接受建议，使用 Tauri shell API。

---

## 3. 接口边界最终确认

### 3.1 保留的接口（无变更）

```typescript
readonly app: {
  getCodexAuthModeState(input: GetCodexAuthModeStateInput): Promise<CodexAuthModeStateOutput>;
  activateCodexChatgpt(input: ActivateCodexChatgptInput): Promise<CodexAuthSwitchResult>;
  captureCodexOauthSnapshot(input: CaptureCodexOauthSnapshotInput): Promise<CodexAuthModeStateOutput>;
}
```

### 3.2 删除的接口

```typescript
readonly app: {
  listCodexProviders(): Promise<CodexProviderStore>;
  upsertCodexProvider(input: CodexProviderDraft): Promise<CodexProviderRecord>;
  deleteCodexProvider(input: DeleteCodexProviderInput): Promise<void>;
  applyCodexProvider(input: ApplyCodexProviderInput): Promise<CodexProviderApplyResult>;
}
```

### 3.3 简化的类型定义

**TypeScript**：
```typescript
// 修改前
export interface CodexAuthModeStateOutput {
  readonly activeMode: CodexAuthMode;
  readonly activeProviderId: string | null;      // 删除
  readonly activeProviderKey: string | null;
  readonly oauthSnapshotAvailable: boolean;
}

// 修改后
export interface CodexAuthModeStateOutput {
  readonly activeMode: CodexAuthMode;
  readonly activeProviderKey: string | null;     // 保留
  readonly oauthSnapshotAvailable: boolean;
}
```

**Rust**：
```rust
// 修改前
pub struct CodexAuthModeStateOutput {
    pub active_mode: CodexAuthMode,
    pub active_provider_id: Option<String>,       // 删除
    pub active_provider_key: Option<String>,
    pub oauth_snapshot_available: bool,
}

// 修改后
pub struct CodexAuthModeStateOutput {
    pub active_mode: CodexAuthMode,
    pub active_provider_key: Option<String>,      // 保留
    pub oauth_snapshot_available: bool,
}
```

### 3.4 需要重构的后端函数

**codex_auth/mod.rs**：
- `get_codex_auth_mode_state()` - 移除内置存储依赖
- `activate_codex_chatgpt()` - 移除内置存储依赖
- 删除 `activate_codex_provider()` 函数

**codex_auth/live.rs**：
- 删除 `detect_active_context()` 函数
- 删除 `build_provider_input_from_live()` 函数
- 保留 `read_model_provider_key()` 函数

**codex_auth/storage.rs**：
- 简化 `PersistedModeState` 结构体
- 简化 `persist_mode_state()` 函数签名

## 4. 验收标准补充

### 4.1 功能验收（已补充）

- [x] 提供商 CRUD UI 完全移除
- [x] 提供商管理后端模块完全删除
- [x] 简化的认证模式卡片正常显示
- [x] 当前 providerKey 正确显示（只读）
- [x] "切换到 ChatGPT"功能正常工作
- [x] CC Switch 推荐卡片正常显示
- [x] 下载链接和文档链接可点击（使用 Tauri `shell::open()` API）

### 4.2 接口边界验收（新增）

- [x] `CodexAuthModeStateOutput` 已删除 `activeProviderId` 字段
- [x] `CodexAuthModeStateOutput.activeProviderKey` 正确从 config.toml 读取
- [x] `get_codex_auth_mode_state()` 已移除内置存储依赖
- [x] `activate_codex_chatgpt()` 已移除内置存储依赖
- [x] `persist_mode_state()` 已简化为只保存 `active_mode`
- [x] 外部链接使用 Tauri `@tauri-apps/plugin-shell` 打开

### 4.3 回归验证（已补充）

- [x] 已有 `codex-providers.json` 文件不影响应用运行

## 5. 测试计划创建

spec-tester 已创建完整的测试计划（test-plan.md），包含：

### 5.1 测试用例覆盖

| 测试类型 | 用例数 | 说明 |
|----------|--------|------|
| 删除验证 | 5 | 验证提供商管理功能完全移除 |
| 保留功能 | 5 | 验证只读显示和 ChatGPT 切换正常 |
| 新增功能 | 4 | 验证 CC Switch 推荐卡片 |
| 回归测试 | 5 | 验证其他功能不受影响 |
| 边界测试 | 3 | 验证异常配置处理 |
| **总计** | **22** | 全面覆盖功能和边界场景 |

### 5.2 关键测试场景

**删除验证**：
- TC-DEL-001: 提供商列表 UI 已移除
- TC-DEL-002: 提供商编辑对话框已移除
- TC-DEL-003: 后端接口已删除
- TC-DEL-004: 国际化键已清理
- TC-DEL-005: CSS 样式已清理

**保留功能**：
- TC-KEEP-001: 读取当前 providerKey（API Key 模式）
- TC-KEEP-002: 读取当前 providerKey（ChatGPT 模式）
- TC-KEEP-003: 切换到 ChatGPT 模式（有快照）
- TC-KEEP-004: 切换到 ChatGPT 模式（无快照）
- TC-KEEP-005: OAuth 快照捕获

**新增功能**：
- TC-NEW-001: CC Switch 推荐卡片显示
- TC-NEW-002: 下载链接打开
- TC-NEW-003: 文档链接打开
- TC-NEW-004: 国际化支持

**回归测试**：
- TC-REG-001: ChatGPT 登录流程
- TC-REG-002: 设置页面其他功能
- TC-REG-003: 应用启动性能
- TC-REG-004: 配置文件读取
- TC-REG-005: 已有 codex-providers.json 文件处理

**边界测试**：
- TC-EDGE-001: 空 config.toml
- TC-EDGE-002: 无效的 providerKey
- TC-EDGE-003: 同时存在 API Key 和 OAuth tokens

### 5.3 性能验证

- 启动速度：删除代码后应略微提升
- 内存占用：删除存储读取后应略微减少
- 设置页面渲染：无明显性能影响

### 5.4 兼容性测试

- 现有用户配置不受影响
- 多环境支持正常
- 已有 `codex-providers.json` 文件不影响应用

## 6. plan.md 更新内容

基于协作讨论，spec-writer 已更新 plan.md：

### 6.1 实现步骤补充

**Step 3: 简化 codex_auth 模块**（已细化）：
- 重构 `get_codex_auth_mode_state()` 函数
- 重构 `activate_codex_chatgpt()` 函数
- 删除内置存储依赖函数
- 简化持久化状态结构

**Step 10: 创建 CodexProviderRecommendationCard**（已细化）：
- 使用 Tauri `@tauri-apps/plugin-shell` 的 `open()` API
- 提供实现示例代码
- 确认依赖已安装

### 6.2 验收标准补充

- 新增"接口边界验收"章节（6 项）
- 补充"回归验证"中的 `codex-providers.json` 处理验证
- 明确外部链接打开方式

## 7. 接口边界审查报告

spec-tester 已创建完整的接口边界审查报告（interface-boundary-review.md），包含：

### 7.1 问题逐项回答

- 问题 1: 保留的 Bridge 接口是否足够？✅ 足够
- 问题 2: 删除 `activeProviderId` 是否影响功能？✅ 不影响
- 问题 3: 外部链接打开方式？✅ 使用 Tauri shell API

### 7.2 接口边界详细设计

- 保留的接口清单
- 删除的接口清单
- 简化的类型定义（TypeScript + Rust）
- 需要重构的后端函数（含实现示例）

### 7.3 数据流分析

- 删除前的数据流
- 删除后的数据流
- ChatGPT 模式切换数据流

### 7.4 风险评估

| 风险类型 | 风险等级 | 缓解措施 |
|----------|----------|----------|
| 接口变更风险 | 低-中 | 充分测试，类型同步更新 |
| 兼容性风险 | 低 | 不修改官方配置文件 |
| 功能完整性风险 | 低-中 | 保留完整的切换逻辑 |

### 7.5 审查结论

**✅ 接口边界设计合理，可以进入实现阶段**

## 8. 协作成果

### 8.1 交付文档

| 文档 | 状态 | 创建者 | 说明 |
|------|------|--------|------|
| plan.md | ✅ 已更新 | spec-writer | 实现计划（已根据协作结果更新） |
| test-plan.md | ✅ 已创建 | spec-tester | 测试计划（22 个测试用例） |
| interface-boundary-review.md | ✅ 已创建 | spec-tester | 接口边界审查报告 |
| collaboration-summary.md | ✅ 已创建 | spec-tester | 本协作总结 |

### 8.2 关键决策

| 决策项 | 决策结果 | 理由 |
|--------|----------|------|
| 是否新增接口读取 providerKey | ❌ 否 | 现有接口已足够 |
| 是否删除 `activeProviderId` | ✅ 是 | 依赖内置存储，删除后无意义 |
| 外部链接打开方式 | Tauri shell API | 官方推荐，跨平台兼容 |
| 是否需要重构后端函数 | ✅ 是 | 移除内置存储依赖 |
| 是否简化持久化状态 | ✅ 是 | 只保留 `active_mode` |

### 8.3 待确认事项

| 事项 | 状态 | 负责人 |
|------|------|--------|
| 确认 `@tauri-apps/plugin-shell` 依赖已安装 | ⏳ 待确认 | spec-executor |
| 确认 Tauri 配置中已启用 `shell` 插件 | ⏳ 待确认 | spec-executor |
| 确认后端函数重构实现细节 | ⏳ 待确认 | spec-executor |

## 9. 下一步行动

### 9.1 spec-writer

- [x] 根据协作结果更新 plan.md
- [x] 确认接口边界设计
- [x] 确认验收标准
- [ ] 通知 TeamLead 协作完成

### 9.2 spec-tester

- [x] 创建 test-plan.md
- [x] 创建 interface-boundary-review.md
- [x] 创建 collaboration-summary.md
- [ ] 准备测试环境
- [ ] 等待实现完成后执行测试

### 9.3 TeamLead

- [ ] 审查协作成果
- [ ] 确认是否进入实现阶段
- [ ] 分配 spec-executor 执行实现

## 10. 协作评估

### 10.1 协作效率

- ✅ 问题响应及时，讨论高效
- ✅ 决策明确，无重大分歧
- ✅ 文档产出完整，质量高

### 10.2 协作质量

- ✅ 接口边界设计合理
- ✅ 验收标准全面
- ✅ 测试计划覆盖充分
- ✅ 风险识别到位

### 10.3 改进建议

- 无重大改进建议
- 协作流程顺畅，可作为后续 Spec 协作的参考模板

---

**协作完成时间**: 2026-04-05 16:40  
**协作参与者**: spec-writer, spec-tester  
**协作结论**: ✅ 接口边界和验收标准已确认，可进入实现阶段
