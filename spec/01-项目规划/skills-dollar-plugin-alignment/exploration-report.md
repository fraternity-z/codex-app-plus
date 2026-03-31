# 探索报告

> 任务：接入插件能力并对齐官方调用方式（首版范围：Skills）
> 参考官方实现：`E:/code/codex`
> 关键约束：对话框 `$` 触发候选；Slash 保持 `/` 且与 `$` 能力不重叠
> 生成时间：2026-03-31
> 角色：spec-explorer

---

## 检索到的历史经验

- 经验记忆索引 `spec/context/experience/index.md` 当前无可复用条目。
- 知识记忆索引 `spec/context/knowledge/index.md` 仅包含设置界面分析（KNOW-001），与本需求关联度低。
- Auto Memory 仅有「前端禁用 index 聚合导出」偏好，可在实现阶段遵循（避免新增 barrel export）。

---

## 官方包能力边界识别（以 `E:/code/codex` 为准）

### 1) Skills 官方调用方式（核心）

依据 `e:/code/codex/codex-rs/app-server/README.md`：

- 文本中使用 `$<skill-name>`。
- `turn/start.input` 推荐同时携带 `skill` 类型输入项：
  - `{ "type": "skill", "name": "...", "path": "..." }`
- 若只发 `$skill-name` 也可被模型解析，但官方文档明确提示：
  - 省略 `skill` input item 会增加定位成本与延迟。

结论：**Skills 的“官方对齐实现”应为：`$` 文本触发 + `skill` input 双通道。**

### 2) Apps / Plugins 与符号语义

依据 `e:/code/codex/codex-rs/app-server/README.md` 与 `e:/code/codex/codex-rs/utils/plugins/src/mention_syntax.rs`：

- Tools/Skills 明文 sigil 为 `$`。
- Plugin 文本提及在 linked plaintext 场景用 `@`。
- App 触发示例使用 `$<app-slug>`，并配 `mention(app://...)`。
- Plugin 触发示例使用 `@sample`，并配 `mention(plugin://...)`。

结论：官方本身是“多 sigil 并存”，并非所有插件统一 `$`。但本次用户范围已限定首版先做 Skills，故可先只落 `$ -> Skills`。

### 3) Plugin API 成熟度边界

官方 README 对以下接口带有明确标注：

- `plugin/read`
- `plugin/install`
- `plugin/uninstall`

均带 “under development; do not call from production clients yet”。

结论：**首版不应把插件安装/卸载链路纳入交付范围**，以免与官方生产建议冲突。

### 4) TUI 侧交互证据

依据 `e:/code/codex/codex-rs/tui/src/chatwidget/skills.rs`：

- `open_skills_list()` 直接插入 `"$"`。
- 菜单提示文本也说明 “press $ to open this list directly”。

结论：官方 TUI 的确将 Skills 候选入口与 `$` 对齐。

---

## 项目现状分析（codex-app-plus）

### A. 当前触发器与候选模式

`e:/code/codex-app-plus/src/features/composer/model/composerInputTriggers.ts`

- 仅有 `kind: "slash" | "mention"`。
- slash 由 `/...` 触发。
- mention 由 `@...` 触发（当前主要用于文件提及）。
- **不存在 `$` 触发分支。**

`e:/code/codex-app-plus/src/features/composer/hooks/useComposerCommandPalette.ts`
`e:/code/codex-app-plus/src/features/composer/model/composerPaletteData.ts`

- Palette mode 仅覆盖 slash 系列与 mention。
- 无 skill-dollar 专用模式。

### B. Slash 现状

`e:/code/codex-app-plus/src/features/composer/service/composerSlashCommandExecutor.ts`

- `/skills` 已存在，行为为请求 `skills/list` 并展示摘要 banner。
- 说明当前 skills 能力挂在 slash 链路，而非 `$` inline invoke。

### C. 协议与输入类型基础已具备

`e:/code/codex-app-plus/src/protocol/generated/v2/UserInput.ts`

- `UserInput` union 已包含：`skill`、`mention`、`text`、`image`、`localImage`。
- 协议白名单 `src/protocol/methods.ts` 也已包含：`skills/list`、`plugin/list`、`plugin/install`、`plugin/uninstall`、`turn/start`。

### D. 发送链路缺口

`e:/code/codex-app-plus/src/features/conversation/hooks/workspaceConversationHelpers.ts`

- `turn/start.input` 来源于 `buildComposerUserInputs(...)`。

`e:/code/codex-app-plus/src/features/composer/model/composerAttachments.ts`

- 当前会构造 `text/image/localImage/mention`。
- `mention` 主要来源于文件附件/文件引用草稿。
- **尚未根据 `$skill` 生成 `type: "skill"` 输入项。**

结论：项目具备协议地基，但缺少 `$ -> skill候选 -> skill input 注入` 的编排层。

---

## 差距清单（官方对齐视角）

1. **触发层差距**：缺少 `$` 触发器与对应 palette 模式。
2. **候选层差距**：缺少 Skills 候选列表在输入中随 `$` 查询联动。
3. **序列化差距**：发送 `turn/start` 前未把选中的 skill 编码为 `UserInput.type = "skill"`。
4. **边界策略缺失**：未明确 Slash 与 `$` 的职责分工（当前实际是 `/skills`）。

---

## 首版范围建议（严格按用户约束）

### 功能范围（In Scope）

- 在对话输入框输入 `$` 时弹出 Skills 候选。
- 支持 `$<query>` 过滤 Skills。
- 选择候选后：
  - 文本中保留/插入 `$skill-name`。
  - 发送时追加 `UserInput { type: "skill", name, path }`。
- Slash 保持现状（`/skills` 继续可用，作为列表/诊断命令），与 `$` 不做能力重叠。

### 非范围（Out of Scope）

- Plugin install/uninstall/read 端到端接入（官方标注 under development）。
- App/plugin 的 `$`/`@` 全量统一策略改造。
- 文件 `@mention` 体系重构。

---

## 设计约束与分流规则（建议写入 plan.md）

1. **符号分流**
   - `/`：命令控制面（配置、模式切换、状态读取、官方命令入口）。
   - `$`：Skills 内联调用入口（本期仅 Skills）。
   - `@`：保持现有文件提及，不在本期并轨。

2. **不重叠原则**
   - `$` 不执行 slash 命令。
   - `/` 不承担 inline skill mention 注入。

3. **发送正确性原则**
   - 仅文本含有效 `$skill` 且命中已加载技能时，才注入 `type: "skill"`。
   - skill item 的 `name/path` 以 `skills/list` 返回为准，避免推测。

4. **兼容原则**
   - 现有 `/skills`、`@文件提及`、附件发送流程不回归。

---

## 风险与边界

- **歧义风险**：未来若要接入 app/plugin mention，会与 `$`/`@` 语义扩展冲突；本期通过“只做 Skills”规避。
- **状态同步风险**：skills 可能变更，需考虑 `skills/changed` 通知驱动候选刷新。
- **输入清洗风险**：当用户手动编辑 `$skill` 文本时，需防止产生失配的 `skill` input item。

---

## 对 Spec 创建（plan/test-plan）的建议

### 给 spec-writer（plan.md）

建议按 4 个实现块拆解：

1. **触发与状态层**：在 composer trigger 体系新增 `$` 触发种类与 mode。
2. **候选数据层**：复用 `skills/list` 数据源，构建 `$` 候选过滤。
3. **提交组装层**：在 `buildComposerUserInputs` 链路注入 `skill` 输入项。
4. **分流守卫层**：明确 `/` 与 `$` 互不重叠，保持现有 `@` 文件提及链路。

### 给 spec-tester（test-plan.md）

至少覆盖：

- `$` 空查询显示候选。
- `$abc` 过滤候选。
- 选择候选后发送：`text + skill` 双 input。
- 输入含 `$` 但未选中有效技能时不注入 `skill`。
- `/skills` 行为不变。
- `@文件提及` 行为不变。
- `skills/changed` 后候选可刷新（若 plan 包含该项）。

---

## 探索结论

本需求可落地且与官方方向一致：

- 官方 Skills 推荐路径是 `$` + `type: "skill"`；
- 当前项目协议已具备，主要缺“触发/候选/组装”三段实现；
- 按用户要求，首版限定 Skills 可以规避 plugin API 仍在开发期带来的不确定性；
- Slash `/` 与 `$` 分流可以在不破坏现有能力的前提下增量上线。
