# i18n 规范

本目录负责 Codex App Plus 前端界面的国际化能力。

目标：

- 提供统一的翻译入口，禁止在 UI 组件中继续散落硬编码用户可见文案。
- 让语言切换由 `uiLanguage` 驱动，支持自动检测系统语言，并能立即作用于已接入 i18n 的界面。
- 让翻译键稳定，不因为组件文件移动或重命名而失效。
- 让缺失翻译、缺失插值参数这类问题显式暴露，而不是静默降级。

当前首批支持语言：

- `auto`（跟随系统，运行时解析为受支持的语言）
- `zh-CN`
- `en-US`

## 目录职责

```text
src/i18n/
  README.md
  index.ts
  types.ts
  format.ts
  provider.tsx
  useI18n.ts
  messages/
    index.ts
    schema.ts
    zh-CN.ts
    en-US.ts
```

职责约定：

- `types.ts`
  定义 `Locale`、`TranslationParams` 等基础类型。
- `messages/zh-CN.ts`
  中文基准消息树。新键先加这里。
- `messages/en-US.ts`
  英文消息树。结构必须与 `zh-CN.ts` 完全一致。
- `messages/schema.ts`
  从 `zh-CN.ts` 推导消息树结构和 `MessageKey`。
- `messages/index.ts`
  维护 `locale -> messages` 映射。
- `format.ts`
  负责按 key 读取消息和 `{name}` 形式的参数插值。
- `provider.tsx`
  提供 `I18nProvider`，同步 `document.lang` 和 `document.title`。
- `useI18n.ts`
  暴露 `useI18n()`。
- `index.ts`
  汇总对外导出。

## 使用方式

组件中统一这样取文案：

```tsx
import { useI18n } from "../../i18n";

export function Example(): JSX.Element {
  const { t } = useI18n();

  return <button>{t("auth.choice.apiKey.action")}</button>;
}
```

带参数的文案：

```ts
t("app.alerts.sendTurnFailed", { error: String(error) });
```

禁止的写法：

```tsx
<button>使用 API Key</button>
window.alert(`发送工作区消息失败: ${String(error)}`);
```

## 键层级规则

翻译键按“领域 + 语义角色”组织，不按组件名或文件路径组织。

标准形态：

```text
domain.scope.item.field
```

例如：

- `settings.general.language.label`
- `settings.general.language.description`
- `settings.general.language.note`
- `home.settingsPopover.login.action`
- `app.alerts.openConfigFailed`

约束：

- 深度上限 4 层。
- 键表示业务语义，不表示界面位置细节。
- 不要把组件名放进键里。
- 不要把文案内容放进键里。
- 不要把顺序信息放进键里，例如 `firstButton`、`leftCard`。

正确示例：

- `settings.nav.general`
- `auth.choice.title`
- `home.settingsPopover.authStatus.chatgpt`

错误示例：

- `GeneralSettingsSectionTitle`
- `leftSidebarFirstButton`
- `useApiKeyChineseText`

## 一级 domain 约定

当前推荐的一级域：

- `app`
  应用壳层、文档标题、全局弹窗错误、顶层加载态。
- `settings`
  设置页导航、常规设置、各类设置分组。
- `home`
  首页、设置弹层、工作区占位。
- `auth`
  登录和鉴权选择。
- 后续新增域使用同样规则，例如 `workspace`、`conversation`、`composer`、`git`、`mcp`。

新增一级域前先判断是否能归入现有领域，避免顶层膨胀。

## field 命名规范

优先复用这些 field 名：

- `title`
- `subtitle`
- `label`
- `description`
- `note`
- `action`
- `placeholder`
- `menuLabel`
- `ariaLabel`
- `message`
- `options`
- `error`

示例：

```ts
language: {
  label: "...",
  description: "...",
  note: "...",
  options: {
    zhCN: "...",
    enUS: "...",
  },
}
```

## options 规范

枚举类显示文案统一收进 `options`，不要在组件里重复声明 label 常量。

例如：

```ts
threadDetailLevel: {
  options: {
    compact: "精简步骤",
    commands: "包含命令输出",
    full: "完整输出",
  },
}
```

注意：

- 业务值可以是 `"zh-CN"`、`"en-US"`，但消息树中的 key 用驼峰稳定表示，如 `zhCN`、`enUS`。
- 组件中负责把业务值映射到对应翻译键，不要直接把业务值当消息树路径的一部分。

## 参数化文案规范

需要拼接变量时，必须使用模板参数，不允许字符串相加。

正确：

```ts
"打开 config.toml 失败: {error}"
```

错误：

```ts
"打开 config.toml 失败: " + error
```

当前支持的参数值类型：

- `string`
- `number`

参数规则：

- 参数名使用英文小驼峰。
- 参数名必须和文案模板中的占位符一致。
- 缺失参数时 `format.ts` 会直接抛错。

## 新增文案流程

新增界面文案时按这个顺序处理：

1. 先在 `messages/zh-CN.ts` 增加新键。
2. 在 `messages/en-US.ts` 增加完全同结构的对应键。
3. 在组件中使用 `useI18n().t()` 替换硬编码。
4. 如果文案是枚举显示值，优先放进 `options`。
5. 如果文案需要参数，改成模板字符串并传 `params`。

不要做的事：

- 不要只改中文不改英文。
- 不要临时在组件里放 `const TEXT = { ... }`。
- 不要为了“先跑起来”给缺失 key 做静默 fallback。

## 迁移规则

首期只要求已接入 i18n 的页面遵守规则，但任何新改动都不应继续引入新的硬编码用户文案。

迁移时优先处理：

- 按钮文本
- 表单 label / description / note
- `window.alert`
- `aria-label`
- placeholder
- 顶层空态和标题

暂不翻译：

- 模型输出
- 协议原文
- 宿主层返回的原始错误正文

对错误类文案，只翻译壳层，原始错误保留在参数里。

## 测试要求

至少覆盖以下几类测试：

- 消息树结构一致性测试
- 参数插值测试
- `I18nProvider` 对 `document.lang` / `document.title` 的同步测试
- 代表性组件在 `zh-CN` / `en-US` 下的渲染测试

当前相关测试文件：

- `src/i18n/format.test.ts`
- `src/i18n/provider.test.tsx`

## 维护原则

- 中文消息树是结构基准，不是运行时默认值的特殊例外。
- `MessageKey` 只允许引用已存在的叶子节点。
- 缺失 key、缺失参数都应显式报错。
- 文档、实现、测试三者必须同步更新。

当 i18n 架构发生明显变化时，先更新本文件，再修改实现。
