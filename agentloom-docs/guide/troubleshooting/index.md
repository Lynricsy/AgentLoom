---
docType: index
---

# 故障排查

| 你手上有什么 | 去哪里 |
| --- | --- |
| 一个错误类型（响应中的 `type`，或提示中的英文标识） | [错误参考](/guide/troubleshooting/errors) |
| 一个症状（连不上线、没有输出、Webhook 不触发、权限不足……） | [常见问题](/guide/troubleshooting/faq) |
| 一次失败的工作流执行 | [调试工作流](/guide/workflows/debugging) |
| 自托管部署起不来或服务不健康 | [部署运维](/deploy/) |

## 定位问题时先收集

- 出错的页面或 API 路径，以及发生时间。
- 完整的错误信息。API 错误响应中的 `type`、`detail` 与 `instance` 三个字段能直接对应到服务端的异常与请求。
- 工作流问题：执行 ID（执行调试页地址 `/executions/:executionId` 中的最后一段）与失败节点的名称。
- 你的组织角色。很多「做不了」的问题是角色权限不足，见[角色与权限](/guide/collaboration/roles)。
