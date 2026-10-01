---
docType: reference
---

# Code Executor

在 AgentLoom 服务端运行一段 TypeScript、JavaScript、Python 或 Bash 代码，把「参数」端口的数据作为输入，把代码产出的结果交给下游。

## 端口与配置

<!--@include: ../../_generated/nodes/code-tool.md-->

## 使用要点

- 代码在服务端以子进程运行：JavaScript 用 `node`，TypeScript 用 `npx tsx`，Python 用 `python3`，Bash 用 `bash`。子进程只继承 `PATH`、`HOME`、`LANG`、`TERM`、`PYTHONPATH` 环境变量。服务端缺少对应解释器时节点失败。需要隔离环境与持久文件时，改用 [Sandbox](/guide/nodes/sandbox) 绑定到 Agent。
- 输入：JavaScript / TypeScript / Python 中通过变量 `input` 读取「参数」端口的数据；Bash 中通过环境变量 `INPUT` 读取其 JSON 字符串。
- 结果：JavaScript / TypeScript / Python 中把结果赋给变量 `output`（例如 `output = { total: input.items.length }`），不要在顶层写 `return`（会报 `SyntaxError: Illegal return statement`）；Bash 中 stdout 最后一行如果是合法 JSON，就作为结果，其余输出作为 stdout。
- 「返回值」端口输出 `output` 的值，「stdout」端口输出代码打印到标准输出的完整文本（`console.log` / `print` 等，每行只记录一次）。
- 超时时间单位为秒，默认 30；超时、进程非零退出、语言未配置或代码为空都会让节点失败，错误信息分别如 `代码执行超时 (30s)`、stderr 内容、`Code Tool 节点缺少受支持的 language 配置`、`Code Tool 节点缺少 code 配置`。

## 相关

- [HTTP Request](/guide/nodes/http-tool)
- [输入预处理器](/guide/nodes/input-preprocessor)
- [Sandbox](/guide/nodes/sandbox)
