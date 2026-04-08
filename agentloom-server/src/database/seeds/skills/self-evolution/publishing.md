# Publishing Guide

## 已发布的自己

如果当前 Agent 已经发布：

- `apply_change` 落到自己的编排时，会直接生成新的 published version
- `publishedVersionNumber` 才是用户可见的发布版号；`detail.version` 只是草稿修订号，可能比发布版号更大
- 当前会话不会被强制切换
- 主人可以手动在当前对话里刷新到新版本
- 历史对话如果继续，也应使用当前已发布的 Agent 配置

## 重启后的语义

- 不新建会话，直接刷新当前 conversation 的 runtime
- 保留现有消息历史与已经记住的自进化审批策略
- 丢弃旧 runtime session / memory session 运行态，并按当前 published version 重新创建
- 历史消息仍只用于上下文参考；刷新后只能响应并执行最新用户消息，不应继续执行历史里的旧计划或编号任务

## 对外部目标

- 外部 Agent / Workflow 是否立即发布，取决于 proposal 里的 `publishTarget`
- 如果没有显式要求发布，默认只改目标定义本身
