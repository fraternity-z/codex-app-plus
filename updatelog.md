# 更新日志 / Changelog

## Features

- i18n：新增自动语言检测并改进语言选项体验。  
	i18n: Added automatic language detection and improved language option experience.

- 启动体验：新增应用启动屏幕，优化初始加载流程。  
	Startup experience: Added a startup screen and optimized the initial loading flow.

- 加载交互：新增侧边栏加载覆盖层，强化加载状态可感知性。  
	Loading interaction: Added a sidebar loading overlay to improve loading-state visibility.

- 文件变更视图：新增文件变更详情面板，提升差异信息展示能力。  
	File changes view: Added a detailed file change panel for better diff presentation.

- 会话能力：重构会话管理，加入会话索引与路径查找能力。  
	Session capabilities: Refactored session management with session indexing and path lookup.

- 控制器与状态：完善应用控制器状态管理，并接入会话增量（delta）处理。  
	Controller and state: Improved app controller state management and integrated conversation delta handling.

- Composer：增强命令桥接能力，新增 slash command 执行器。  
	Composer: Enhanced command bridge support and added a slash command executor.

## Bug Fixes

- 连接恢复：在连接状态变化时重置临时请求状态，避免残留请求状态导致异常。  
	Connection recovery: Reset transient request state on connection-status changes to avoid stale-state issues.

- 会话删除：优化会话删除逻辑，降低状态不一致风险。  
	Session deletion: Improved deletion logic to reduce state inconsistency risks.

- 终端显示：更新终端配色与过渡效果，提升可读性与视觉一致性。  
	Terminal display: Updated terminal color scheme and transitions for better readability and visual consistency.

## Tests

- 为启动屏幕与连接状态重置等关键路径补充单元测试，提升回归保障。  
	Added unit tests for key paths such as startup screen behavior and connection-state reset to improve regression coverage.