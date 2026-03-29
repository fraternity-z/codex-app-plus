# 修复上下文窗口使用量统计

## Goal
修复当前对话框下方上下文窗口使用量统计不准确的问题，使其与 CodexMonitor 的统计口径保持一致。

## Requirements
- 对比当前项目与 CodexMonitor 的上下文窗口统计实现
- 找出导致当前显示不准确的口径差异
- 在不破坏现有 UI 结构的前提下修复统计逻辑
- 为修复后的逻辑补充/更新测试覆盖边界情况

## Acceptance Criteria
- [ ] 对话框下方上下文窗口使用量与 CodexMonitor 保持一致或等价
- [ ] 当累计 total 超过 context window 时，显示逻辑仍然正确
- [ ] 当仅 last 可用或 total/last 出现异常组合时，显示逻辑正确
- [ ] 相关测试通过
- [ ] typecheck / test / build 至少执行必要检查且通过

## Technical Notes
- 当前实现位于 src/features/conversation/model/conversationContextWindow.ts
- UI 展示位于 src/features/composer/ui/ComposerContextWindowIndicator.tsx
- 参考项目位于 E:/code/CodexMonitor
