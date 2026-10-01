---
docType: howto
---

# 创建工作流

本页说明如何新建工作流，并在画布上添加、连接和配置节点。前提：已登录 Studio，并已加入一个组织。

## 新建工作流

1. 在侧边栏「构建」组点击「工作流」，点击页面右上角的「新建」。列表为空时也可以点击「创建第一个工作流」。
2. 在「新建工作流」对话框中填写「名称」（必填）与「描述」（可选），点击「创建」。

页面跳转到 `/workflows/:workflowId` 的空白画布。从模板、导出文件或分享链接创建工作流，见 [使用模板](/guide/workflows/templates) 与 [分享与导出](/guide/workflows/sharing)。

## 添加节点

从左侧节点面板把节点拖到画布上，松开后节点出现在落点位置。面板按以下分组列出节点：Agent、Tool、Trigger、Knowledge、Memory、Output、Control；启用插件后多出 Plugins 分组。面板顶部的「搜索节点...」输入框可按名称筛选。

以下节点不能从分组列表直接拖出：

- 循环起点、迭代起点：拖入 [Loop](/guide/nodes/loop) / [Iteration](/guide/nodes/iteration) 容器时自动创建。
- Loop State、Result、Break、Continue：选中 Loop 或 Iteration 容器后出现在「Compound 内部节点」分组。
- Reusable Block：在画布上把已选节点「封装为可复用块」，或从节点面板「My Blocks」标签拖入，见 [Reusable Block](/guide/nodes/reusable-block)。
- 插件节点：从 Plugins 分组拖出，见 [插件节点](/guide/nodes/plugin)。

每个节点的端口与行为见 [节点参考](/guide/nodes/)。

## 连接端口

从一个节点右侧的输出端口按住拖到另一个节点左侧的输入端口，松开后出现连线。

- 只有数据类型兼容的端口才能连上；类型与兼容规则见 [什么是 AgentLoom](/guide/getting-started/)。
- 没有名称的端口是执行流端口（类型 `exec`），只与执行流端口相连，用于在没有数据依赖的节点之间规定先后顺序。
- 节点在所有输入连线的上游都结束后才执行；没有输入连线的节点在执行开始时就运行。已经有数据连线的两个节点不需要再连执行流。
- 有的输入端口可以接多条线（例如 Agent 的「Skills」「扩展工具」），有的只能接一条（例如 Agent 的「系统提示词」）；生成表中的「多连接」列给出了每个端口的规则。

## 配置节点

点击节点，右侧打开配置面板：

- 面板头部的名称输入框（「节点名称」）可修改节点在画布上显示的名称。
- 「配置」标签是该节点类型的配置表单；没有配置项的节点显示「该节点无需额外配置」。
- 「输出」标签显示最近一次执行的状态与输出，见 [运行与监控](/guide/workflows/running)。

各节点配置项的含义见对应的节点页。

## 删除与查找节点

- 选中节点后按 Delete 或 Backspace 删除；选中多个节点时一起删除。在输入框中按这两个键不会删除节点。
- 在节点上右键，上下文菜单中有「删除」。
- 按 Ctrl+F（macOS 为 Cmd+F）打开「搜索节点」，Enter 跳到下一个结果，Shift+Enter 跳到上一个，Esc 关闭。

## 保存

工作流画布自动保存，底部状态栏显示「未保存」「保存中...」或「已保存 · 时间」。自动保存只更新草稿，不创建版本；需要一个可回看的保存点时，使用工具栏的「保存快照」，见 [版本管理](/guide/workflows/versions)。

## 下一步

- [输入参数](/guide/workflows/input-parameters)：让工作流在运行时接收输入。
- [运行与监控](/guide/workflows/running)：运行工作流并查看结果。
