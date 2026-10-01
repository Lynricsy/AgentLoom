---
docType: reference
---

# 输入预处理器

用 JMESPath、JSONata、模板或脚本把上游的文本或 JSON 转换成下游需要的形状。

## 端口与配置

<!--@include: ../../_generated/nodes/input-preprocessor.md-->

## 使用要点

- 转换类型（`transformType`）四选一：`jmespath`、`jsonata`、`template`（面板显示「模板」）、`script`（面板显示「脚本」）；「转换表达式」不能为空，否则节点失败（`InputPreprocessor: expression 不能为空`）。
- 表达式的输入是一个以**输入端口 ID 为键**的对象，例如 `{ "text-in": "…", "json-in": { … } }`。引用上游 JSON 时写 `"json-in".items`（JMESPath）或 <code v-pre>{{json-in.name}}</code>（模板），而不是直接写字段名。
- 模板模式把 <code v-pre>{{a.b}}</code> 占位符替换为对应值，找不到的占位符替换为空字符串，结果是文本。
- 脚本模式在受限的 JavaScript 环境中运行，只能访问 `input`、`JSON`、`Math`、`Date`、`String`、`Number`、`Boolean`、`Array`、`parseInt`、`parseFloat` 与部分 `Object` 方法，硬超时 5 秒；脚本最后一个表达式的值就是结果，顶层 `return` 不可用，例如 `input['text-in'].trim().toUpperCase()`。
- 结果是字符串时从「文本」端口输出；结果是对象时从「JSON」端口输出；结果为空时输出空对象。脚本返回数组或数字等非对象值时，会被包装为 `{ "result": 值 }`。
- 「输出格式」只作为标记写入执行结果，不改变转换结果本身。
- Agent 画布中也有输入预处理器，连接到 Agent Main 的「输入预处理」端口后，用户消息会先经过预处理再交给 Agent。

## 相关

- [Code Executor](/guide/nodes/code-tool)
- [HTTP Request](/guide/nodes/http-tool)
