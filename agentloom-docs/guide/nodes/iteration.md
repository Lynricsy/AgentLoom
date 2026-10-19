---
docType: reference
---

# Iteration

对一个数组逐项执行内部子图，常用于批量处理列表中的每一项。Iteration 是一个容器节点，容器内的迭代起点每轮输出当前项。

## 端口与配置

### Iteration 容器

<!--@include: ../../_generated/nodes/iteration.md-->

### 迭代起点

<!--@include: ../../_generated/nodes/iteration-start.md-->

## 使用要点

- 把 Iteration 拖入画布时会自动在容器内创建「迭代起点」节点，该节点不能删除。迭代起点每轮输出「当前项」与「索引」（从 0 开始）；勾选「暴露总数」「暴露首项标记」「暴露末项标记」可输出更多上下文。
- 待迭代的数组来自「数组」端口；数组为空时容器立即完成。「数组」端口可以连接 JSON 类型的输出（如 Code Executor 的「返回值」、Merge、触发器数据、输入预处理器的「JSON」），运行时按实际值判定：值是数组时逐项迭代；输入预处理器脚本返回数组时得到的 `{ "result": [...] }` 按其中的数组迭代；其他值（对象、字符串等）让 Iteration 失败，错误类型 `node-type-mismatch`，`detail` 写明实际类型。
- 选中 Iteration 容器后，节点面板的「Compound 内部节点」分组提供 Result、Break、Continue，用法与 [Loop](/guide/nodes/loop) 中相同：Result 按输出键提交每一项的结果，并在容器上生成同名输出端口。通过 API 保存或发布工作流时，服务端同样按容器内 Result 的输出键补齐这些端口，不需要在容器的 `outputPorts` 中手写。
- Iteration 的「输出模式」：「收集为数组」（默认）把每一项的结果收集为数组；「保留最后一次结果」只保留最后一项的结果；「纯控制流」不输出结果。
- 各项按顺序逐个处理，不并行。任一内部节点失败，整个 Iteration 失败。
- 配置面板中的「额外输入端口」可通过「添加输入」增加，这些输入会同步映射到迭代起点的输出，供容器内节点使用；它们可接收任意类型的上游值（例如沙箱、工作区等资源端口），值原样传入。

## 相关

- [Loop](/guide/nodes/loop)
- [Merge](/guide/nodes/merge)
