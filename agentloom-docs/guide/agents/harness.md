---
docType: howto
---

# 用 Harness 定制 Agent 运行时

有沙箱 Agent 的核心是在沙箱里运行的 DeepSeek Harness。本页说明如何在 Agent 画布上用 Harness 节点给它挂载 runtime 插件、写 profile patch，并在对话中查看运行时事件。前提：

- 一个「有沙箱」运行形态的 Agent（见 [创建 Agent](/guide/agents/creating)）；无沙箱 Agent 的节点面板里没有「运行时」分组。
- 要挂载上传的插件包时，手头有一个已签名的 runtime 插件 `.alp`（开发方法见 [开发 runtime 插件](/api/plugins/runtime)），且你在组织中的角色是 `owner`、`admin` 或 `creator`。启用、停用、删除插件需要 `owner` 或 `admin`。

::: warning 未在本轮验证
本页的 Studio 操作没有在运行中的部署上实跑；按钮与提示文案取自 Studio 源码。
:::

## 1. 上传并启用 runtime 插件

只用 npm 上的插件时跳过本步。

1. 在侧边栏「资源」组点击「Runtime 插件」，点击「上传 runtime 插件」。
2. 选择 `.alp` 文件，勾选「上传后立即启用」，点击「上传并注册」。

提示「Runtime 插件已上传」，列表中出现该插件，状态为「已启用」。未勾选时状态为「已注册」，之后在列表的操作列启用。只有「已启用」的插件能在画布中选择、在发布时通过校验。

## 2. 放置节点并连线

1. 打开 Agent 画布，从节点面板「运行时」分组拖入「Harness」和一个或多个「Runtime 插件」。每个画布最多一个 Harness 节点。
2. 把每个 Runtime 插件节点的「插件」端口连到 Harness 节点的「Runtime 插件」端口。
3. 把 Harness 节点的「Harness」输出端口连到 Agent Main 的「Harness」端口。Harness 节点只能连到这个端口，这个端口也只接受 Harness 节点。

插件按连到「Runtime 插件」端口的连线顺序加载，后加载的插件可以覆盖先加载插件的配置。Harness 节点面板的「已挂载插件」按这个顺序编号列出。

## 3. 配置 Runtime 插件节点

点击 Runtime 插件节点，在「来源」中选择：

- 「已上传的插件包」：在「插件」下拉框中选择 `名称@版本`。插件声明了配置项时，面板下方出现「插件配置」表单；标注「此字段请在 profile patch 中配置」的字段需要写在 Harness 节点的 profile patch 里。所选插件被停用或删除后，面板显示「当前选择的插件已停用或已删除，请重新选择。」
- 「npm 包（VM 内在线安装）」：填写「npm 包名」（如 `@deepseek-ai/dsh-tool-todo`）与「版本」，两者必填。每次 Agent 的沙箱会话启动时都会联网安装这个包，对话启动会因此变慢；包的要求见 [开发 runtime 插件](/api/plugins/runtime#改用-npm-发布)。

关闭「启用」后节点与连线保留，但对话中不加载该插件。

## 4. 写 profile patch（可选）

点击 Harness 节点，「引擎」显示当前的 DeepSeek Harness 版本。在「Profile patch (YAML)」中填写 `cordis.patch.yml` 片段，它在平台配置与所有插件之后应用，可以覆盖其中任何条目。例如关闭 dsh 自带的 todo 工具：

```yaml
- id: tool-todo
  disabled: true
```

内容必须是 YAML 列表；输入框失焦时校验，不合法时显示「必须是 YAML 列表」或解析错误，此时仍会保存，但保存或发布画布会被拒绝。

## 5. 发布并对话

点击「发布」。发布时平台确认每个启用的已上传插件仍处于「已启用」状态；不满足时发布失败，提示 `runtime 插件 <id> 不存在或未启用`。

打开与该 Agent 的对话并发送消息。插件注册的工具会像内置工具一样出现在工具卡片中；插件要求人工确认的工具调用会出现审批卡片，30 秒内没有处理按拒绝处理。

## 6. 查看 Harness 事件

对话页右栏顶部有「电脑」与「Harness」两个标签。切到「Harness」，Agent 执行时按轮次（`Turn N`）列出运行时事件，如 `turn/start`、`step/start`、`tool/call`、`tool/result`、`step/end`、`turn/end`：`tool/call` 行显示工具名，`tool/result` 行显示「成功」或「失败」，`turn/end` 行显示结束原因，`assistant/message` 行显示输入与输出 token 数。还没有事件时显示「等待 dsh 事件…」。

这些事件只在页面打开时实时接收，不保存在对话记录里：刷新页面或重新打开对话后，之前的事件不再显示。

## 出错时

| 现象 | 处理 |
| --- | --- |
| 保存或发布时报 `agent-canvas-invalid-harness` | 按 `detail` 修正：profile patch 不是 YAML 列表、npm 节点缺版本或包名不合法、已上传插件节点未选择插件 |
| 发布时报 `runtime 插件 <id> 不存在或未启用` | 到「Runtime 插件」页启用该插件，或在节点中重新选择 |
| 对话开始时报 `runtime 插件 <名称>@<版本> 安装失败: …` | npm 包名或版本不存在，或沙箱无法访问 npm registry |
| 对话开始时报 `dsh 运行时启动失败: …` | 插件加载失败或 profile patch 写错；错误后附运行时输出，交给插件开发者排查 |
