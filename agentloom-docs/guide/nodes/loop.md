---
docType: reference
---

# Loop

重复执行一段内部子图，并在每一轮之间传递状态，直到遇到 Break 或达到轮次上限。Loop 是一个容器节点，容器内的循环起点、Loop State、Result、Break、Continue 节点共同控制每一轮的行为。

## 端口与配置

### Loop 容器

<!--@include: ../../_generated/nodes/loop.md-->

### 循环起点

<!--@include: ../../_generated/nodes/loop-start.md-->

### Loop State

<!--@include: ../../_generated/nodes/loop-state.md-->

### Result

<!--@include: ../../_generated/nodes/result.md-->

### Break

<!--@include: ../../_generated/nodes/break.md-->

### Continue

<!--@include: ../../_generated/nodes/continue.md-->

## 使用要点

- 把 Loop 拖入画布时会自动在容器内创建「循环起点」节点，该节点不能删除。选中 Loop 容器后，节点面板会出现「Compound 内部节点」分组，提供 Loop State、Result、Break、Continue。
- 初始状态取自 Loop 的「初始状态」端口；未连线时使用配置面板中的默认初始状态（可填写 JSON）。每一轮开始时，循环起点输出「轮次」（从 0 开始）与「当前状态」；勾选「暴露上一轮结果」「暴露首轮标记」可输出更多上下文。
- Loop State 把「下一轮状态」端口的值提交为下一轮的状态；本轮没有执行 Loop State 时，下一轮沿用当前状态。
- Result 把「结果值」端口的值按「输出键」（默认 `result`）提交给容器；同一容器内的输出键不能重复。每个输出键会成为 Loop 容器上的一个输出端口；通过 API 保存或发布工作流时，服务端按容器内 Result 的输出键补齐这些端口，不需要在容器的 `outputPorts` 中手写。
- Loop 的「输出模式」：「保留最后一次结果」（默认）只保留最后一轮各输出键的值；「收集为数组」把每一轮的值收集为数组；「纯控制流」不输出结果。
- Break 结束整个循环，Continue 跳过当前轮剩余节点进入下一轮。两者的「触发模式」为「总是触发」或「表达式触发」；表达式触发时可通过「添加输入」增加「表达式输入端口」，表达式中用 `ports[1]` 引用第一个添加的输入，例如 `ports[1] === 'skip'`。
- 容器上通过「添加输入」增加的输入端口，以及 Break、Continue 的表达式输入端口，都可接收任意类型的上游值（例如沙箱、工作区等资源端口），值原样传入，不做类型转换。
- Continue 会丢弃当前轮已提交的 Result；Break 触发时，当前轮中已就绪的 Result 仍会执行，其结果会被保留（配置面板中「当前轮半成品会被丢弃」的说明与服务端行为不一致，以服务端为准）。
- 循环最多执行 100 轮，达到上限时以 `max_iterations` 结束；该上限目前不能在界面中修改。没有 Break 的循环会一直运行到上限。
- 循环结束后，执行详情中 Loop 步骤的 `compound` 字段记录 `rounds`（完成轮数）与 `finalState`（结束时的状态）。`finalState` 包含最后一轮 Loop State 提交的值，Break 结束的那一轮也计入。
- 容器内节点按依赖顺序逐个执行；任一内部节点失败，整个 Loop 失败。
- Result、Break、Continue 在 [Iteration](/guide/nodes/iteration) 容器中同样可用；Loop State 只用于 Loop。
- 点击容器标题栏的箭头可收起容器：收起后容器缩成卡片，内部节点与相连连线不显示；再次展开时容器撑开到能容纳全部内部节点。配置面板勾选「保存为收起态」效果相同。

## 相关

- [Iteration](/guide/nodes/iteration)
- [Condition](/guide/nodes/condition)
