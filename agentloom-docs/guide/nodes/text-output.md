---
docType: reference
---

# Text Output

把上游的结果作为一段文本记录下来，作为工作流的文本输出。

## 端口与配置

<!--@include: ../../_generated/nodes/text-output.md-->

## 使用要点

- 执行时节点读取「文本」端口的值：值是字符串时原样记录；是对象或数组时记录其 JSON 字符串；没有值时记录空字符串。
- 节点没有输出端口，通常放在工作流末尾。执行详情中该节点的 `content` 字段即输出内容。
- [生成应用](/guide/generated-apps/) 的公开运行时会把 Text Output 节点的非空内容作为「Workflow 文本输出」展示给应用使用者。

## 相关

- [JSON Output](/guide/nodes/json-output)
- [运行与监控](/guide/workflows/running)
