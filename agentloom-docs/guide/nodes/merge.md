---
docType: reference
---

# Merge

等待多路上游数据，把它们合并为一个数组后输出。常放在 [Condition](/guide/nodes/condition) 的多个分支之后汇合数据。

## 端口与配置

<!--@include: ../../_generated/nodes/merge.md-->

## 使用要点

- Merge 出现在节点面板的 Control 分组中，可直接拖入画布。
- 配置面板「合并配置」的「合并模式」：「追加拼接」把所有输入按端口顺序拼接为一个数组，输入本身是数组时会被展开；「按键合并」按「合并键」（例 `id`）把键值相同的对象合并为一个对象，缺少该键的对象被丢弃。默认「追加拼接」。
- 「输入端口」区域可「添加输入」，输入数量最少为 2。值为空的输入会被忽略。
- 上游某一路因条件分支被跳过时，Merge 仍会在其他路完成后执行；只有所有上游都被跳过时 Merge 才被跳过。

## 相关

- [Condition](/guide/nodes/condition)
- [Iteration](/guide/nodes/iteration)
