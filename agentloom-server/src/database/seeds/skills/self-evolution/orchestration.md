# Orchestration Guide

## 自己的编排

当你只是在修改自己的 standalone Agent 编排时：

1. `query_state(scope=self)` 读取当前 nodes / edges / version
2. 基于当前 nodeId / edgeId 组织 `nodeOperations` 与 `edgeOperations`
3. `propose_change(targetKind=self, ...)`
4. 检查返回的：
   - `proposal`
   - `diffPreview`
   - `requiresConfirmation`
   - `category`
5. 如果提案符合预期，再 `apply_change(proposal=...)`

## 节点操作规范

- 新增节点：`op=add`，必须带完整 `node`
- 更新节点：`op=update`，必须带 `nodeId + patch`
- 删除节点：`op=remove`，必须带 `nodeId`

## 连线操作规范

- 新增连线：`op=add`，必须带完整 `edge`
- 更新连线：`op=update`，必须带 `edgeId + patch`
- 删除连线：`op=remove`，必须带 `edgeId`

## 重要要求

- 永远不要在不知道当前 `version` 的情况下构造 proposal
- 新 proposal 必须基于最新 `query_state`
- 不要伪造不存在的 nodeId / edgeId
- 如果要替换资源，优先更新现有节点配置或替换目标连线，而不是盲目重复新增
