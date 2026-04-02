# Publishing Guide

## 已发布的自己

如果当前 Agent 已经发布：

- `apply_change` 落到自己的编排时，会直接生成新的 published version
- 当前会话不会被强制切换
- 主人可以手动重启到新版本

## 重启后的语义

- 继承完整消息历史
- 继承已经记住的自进化审批策略
- 不继承旧 sandbox session / memory session 运行态

## 对外部目标

- 外部 Agent / Workflow 是否立即发布，取决于 proposal 里的 `publishTarget`
- 如果没有显式要求发布，默认只改目标定义本身
