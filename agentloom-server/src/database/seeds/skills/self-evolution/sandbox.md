# Sandbox Guide

只有在启用了沙箱管理能力时，才能调整 sandbox / workspace 相关配置。

## 典型场景

- 调整 CPU / memory / disk / timeout
- 替换或新增 workspace
- 修改 workspace -> sandbox 绑定

## 推荐流程

1. `query_state(scope=self)` 读取当前 sandbox / workspace 相关节点
2. 基于现有节点生成 `propose_change`
3. 关注返回的 `category`
   - `sandbox_spec_adjustment`
   - `workspace_sandbox_binding_adjustment`
4. 等待审批
5. `apply_change(proposal=...)`

## 风险

- 调大资源规格会增加成本
- 切换 workspace 可能改变后续运行输入
- 删除 sandbox / workspace 节点可能导致运行时失去持久化上下文
