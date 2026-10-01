---
docType: reference
---

# JSON Output

把上游的结果作为一个 JSON 对象记录下来，作为工作流的结构化输出。

## 端口与配置

<!--@include: ../../_generated/nodes/json-output.md-->

## 使用要点

- 执行时节点读取「JSON」端口的值：值是对象时原样记录；不是对象（字符串、数字、数组等）时包装为 `{ "value": 值 }`。
- 节点没有输出端口，通常放在工作流末尾。执行详情中该节点的 `json` 字段即输出内容。
- [生成应用](/guide/generated-apps/) 的公开运行时会把 JSON Output 节点的结果作为「Workflow JSON 输出」展示给应用使用者。

## 相关

- [Text Output](/guide/nodes/text-output)
- [运行与监控](/guide/workflows/running)
