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
- 待迭代的数组来自「数组」端口；数组为空时容器立即完成。
- 选中 Iteration 容器后，节点面板的「Compound 内部节点」分组提供 Result、Break、Continue，用法与 [Loop](/guide/nodes/loop) 中相同：Result 按输出键提交每一项的结果，并在容器上生成同名输出端口。
- Iteration 的「输出模式」：「收集为数组」（默认）把每一项的结果收集为数组；「保留最后一次结果」只保留最后一项的结果；「纯控制流」不输出结果。
- 各项按顺序逐个处理，不并行。任一内部节点失败，整个 Iteration 失败。
- 配置面板中的「额外输入端口」可通过「添加输入」增加，这些输入会同步映射到迭代起点的输出，供容器内节点使用。

## 相关

- [Loop](/guide/nodes/loop)
- [Merge](/guide/nodes/merge)
