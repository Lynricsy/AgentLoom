---
docType: howto
---

# 使用 Agent 内置工具

Agent 不连任何画布节点也带有一组内置工具：有沙箱 Agent 在沙箱里多出代码智能、结构化查改、浏览器与 Python 内核；两种运行形态都可以用网页搜索与图像生成。本页说明每个工具做什么、怎样开关，以及图像模型与搜索后端怎样配置。前提：

- 一个已创建的 Agent（见 [创建 Agent](/guide/agents/creating)）。沙箱内工具只对「有沙箱」Agent 生效，且部署使用的沙箱镜像包含 Chromium 与 language server（见 [Firecracker 沙箱](/deploy/firecracker)）。
- 要用 `generate_image` 时，组织里有一个「模型用途」为「图像生成」并设为默认的模型配置（见下文 [配置图像模型](#配置图像模型)）。
- 要换网页搜索后端时，能修改部署的环境变量（见下文 [配置网页搜索后端](#配置网页搜索后端)）。

::: warning 未在本轮验证
本页的 Studio 操作与对话示例没有在运行中的部署上实跑；面板文案、工具参数与错误文本取自 Studio、`agentloom-deploy/sandbox/src/dsh-plugins/` 与 `agentloom-server/src/modules/builtin-tools/` 源码。
:::

## 工具一览

| 工具 | 运行形态 | 用途 | Agent Main 中的开关 |
| --- | --- | --- | --- |
| `lsp` | 有沙箱 | 诊断、跳转定义、查引用、悬停类型、符号、重命名、快速修复；`write` / `edit` 成功后自动附带该文件的诊断 | 「原生工具」→「代码智能（LSP）」 |
| `ast_grep` | 有沙箱 | 按语法结构搜索代码 | 「原生工具」→「结构化代码查改（AST）」 |
| `ast_edit` | 有沙箱 | 按语法结构批量改写代码 | 同上；写盘还需要「文本编辑」 |
| `browser` | 有沙箱 | 用无头 Chromium 打开页面、读取文本与无障碍树、点击输入、执行脚本、截图 | 「原生工具」→「浏览器」 |
| `eval` | 有沙箱 | 跨调用保持变量的 Python 内核，代码里可以回调其他工具 | 「原生工具」→「Python 执行内核」；需要「终端执行」 |
| `web_search` | 两种都有 | 检索网页，返回带摘要的来源列表 | 「内置服务工具」→「网页搜索」 |
| `generate_image` | 两种都有 | 用组织默认图像模型生成图片 | 「内置服务工具」→「图像生成」 |

## 打开或关闭工具

1. 打开 Agent 画布，点击 Agent Main 节点。
2. 有沙箱 Agent 在「原生工具」中可以看到「代码智能（LSP）」「结构化代码查改（AST）」「浏览器」「Python 执行内核」四个开关；两种 Agent 都有「内置服务工具」区域，内含「网页搜索」「图像生成」。所有开关默认打开。
3. 改完后点击「发布」。新开的对话按发布版本加载工具；关闭的工具不会出现在 Agent 的工具列表里，模型调用时得到未知工具的错误。

开关之间的约束：

- 关闭「文本编辑」时，`ast_edit` 仍可预览，`dry_run=false` 返回 `ast_edit is disabled by the agent's native tool policy (editEnabled=false)`；`lsp` 的 `rename` / `code_actions` 带 `apply=true` 时返回 `lsp apply is disabled by the agent's native tool policy (editEnabled=false)`。
- 「Python 执行内核」在「终端执行」关闭时变灰，`eval` 不加载。
- 「图像生成」打开但组织没有默认图像模型时，`generate_image` 不出现。
- 有沙箱 Agent 调用的无沙箱子 Agent 复用父 Agent 的沙箱，按只读策略运行：保留 `lsp`、`ast_grep`、`ast_edit`（不能写盘），不加载 `browser` 与 `eval`。

沙箱规格建议：`lsp`（TypeScript 语言服务）、`browser`（Chromium）与 `eval` 在沙箱 VM 内常驻进程，建议在 Agent 的沙箱配置中把内存设为 2 GiB 或以上。新建 Agent 的默认规格是 512 MiB，此时 TypeScript 语言服务可能被内核 OOM 终止，写入后不再附带诊断，Chromium 也可能无法启动；不需要这些工具时可在 Agent Main 中关闭它们。

## 配置图像模型

1. 在左侧导航「资源」组打开「LLM 模型」，打开「添加模型配置」对话框。
2. 「模型用途」选「图像生成」。提供商只列出 OpenAI 兼容协议（`openai_chat` / `openai_responses`）与 Gemini（`google`）协议的服务商。
3. 选择模型，例如 OpenAI 的 `gpt-image-1` 或 Gemini 的图像模型，打开「设为默认配置」（说明文字为「默认图像模型供 Agent 的 generate_image 工具使用」），保存。

列表中该行的用途显示「图像生成」。设为默认的图像模型与默认对话模型、默认 Embedding 模型互不影响。之后新开的对话里，开启了「图像生成」的 Agent 就有 `generate_image`。

## 配置网页搜索后端

`web_search` 按服务端环境变量 `APP_WEB_SEARCH_PROVIDERS` 列出的顺序依次尝试搜索后端，第一个成功的结果返回给模型；没有配置 API Key 的后端自动跳过。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `APP_WEB_SEARCH_PROVIDERS` | `duckduckgo` | 逗号分隔，可选 `duckduckgo`（免 key）、`tavily`、`brave`、`exa` |
| `APP_WEB_SEARCH_TAVILY_API_KEY` | 空 | Tavily Search API Key |
| `APP_WEB_SEARCH_BRAVE_API_KEY` | 空 | Brave Search API 订阅 Token |
| `APP_WEB_SEARCH_EXA_API_KEY` | 空 | Exa API Key |

DuckDuckGo 常对数据中心 IP 返回拦截页，生产部署至少配置一个带 key 的后端，例如：

```bash
APP_WEB_SEARCH_PROVIDERS=tavily,duckduckgo
APP_WEB_SEARCH_TAVILY_API_KEY=tvly-xxxxxxxx
```

Compose 部署写进 `agentloom-deploy/` 下的 `.env` 后执行 `docker compose up -d server worker`；Helm 部署写在 `values.yaml` 的 `env.shared` 下（API Key 进入 server Secret），见 [Helm 部署](/deploy/helm)。变量的完整说明见 [配置参考](/deploy/configuration)。

## 各工具的参数与输出

路径参数都可以写成工作区相对路径或绝对路径，必须位于沙箱工作区 `/workspace` 之内（经符号链接指向工作区外的路径同样拒绝），否则报 `path must be under /workspace/ — got: …`。

### `lsp`

| 参数 | 说明 |
| --- | --- |
| `action` | 必填：`diagnostics`、`definition`、`references`、`hover`、`symbols`、`rename`、`code_actions`、`status` |
| `file` | 目标文件；`status` 与带 `query` 的 `symbols` 之外必填 |
| `line` / `column` | 1 起的行号、列号；省略 `column` 时取该行第一个非空白字符 |
| `symbol` | 改为定位该名字的第一次出现（给了 `line` 时先在该行找） |
| `query` | `symbols`：工作区符号搜索词；`code_actions`：要预览或应用的动作编号或标题片段 |
| `new_name` | `rename` 的新名字 |
| `apply` | `rename` / `code_actions` 为 `true` 时写盘，默认只预览 |
| `timeout` | 单次请求超时秒数，1–120，默认 10 |

language server 按文件扩展名选择：TypeScript / JavaScript 用 `typescript-language-server`，Python 用 `pyright-langserver`，沙箱镜像已预装；Go 的 `gopls` 与 Rust 的 `rust-analyzer` 未预装，在项目的 `node_modules/.bin` 或 `PATH` 上可找到时自动启用。`status` 列出各 server 是否可用与正在运行的实例；实例空闲 10 分钟后关闭。

`write`、`edit` 写入文件成功后，如果该文件有错误或警告，工具结果末尾追加一段 `[lsp diagnostics for …] N error(s), M warning(s):`，最多 20 条。

### `ast_grep` 与 `ast_edit`

模式是目标语言的代码，`$NAME` 匹配一个节点，`$$$NAME` 匹配一串节点，例如 `console.log($$$ARGS)`。

| 参数 | `ast_grep` | `ast_edit` |
| --- | --- | --- |
| `pattern` | 必填 | 必填 |
| `rewrite` | — | 必填，可引用模式中的元变量 |
| `path` | 文件或目录，默认工作区根 | 必填 |
| `lang` | `auto` 或省略时按每个文件的扩展名推断 | 同左 |
| `include` | 目录模式下的 glob，如 `*.ts` | 同左 |
| `limit` | 最多返回的匹配数，1–500，默认 100 | — |
| `dry_run` | — | 默认 `true` 只预览；`false` 写盘 |

目录模式跳过 `node_modules`、`.git`、`dist`、`build`、`target`、`.venv`、`__pycache__`。`ast_grep` 输出按文件分组，末尾 `Total: N matches in M files`；`ast_edit` 预览末尾为 `Total: N replacements in M files (dry run, …)`，写盘后为 `Applied N replacements in M files`（单次将被改写的文件超过 200 个或替换超过 2000 处时报错，要求缩小 `path` 或 `include`）。

### `browser`

先用 `open` 得到标签页 id（如 `t1`），之后的动作都带上它。

| 参数 | 说明 |
| --- | --- |
| `action` | 必填：`open`、`goto`、`click`、`type`、`press`、`wait`、`text`、`snapshot`、`screenshot`、`evaluate`、`tabs`、`close` |
| `tab` | 除 `open`、`tabs` 外必填；`close` 省略时关闭整个浏览器 |
| `url` | `http:`、`https:` 或 `data:`；`open` 可选，`goto` 必填 |
| `selector` | CSS 选择器；`click`、`type` 必填，`text`、`wait` 可选 |
| `text` / `clear` | `type` 输入的文字；`clear` 为 `true` 时先清空，默认 `false` |
| `key` | `press` 的按键，如 `Enter` |
| `expression` | `evaluate` 在页面中求值的 JavaScript 表达式，返回其 JSON |
| `wait_until` | `open` / `goto` 的完成事件：`load`（默认）、`domcontentloaded`、`networkidle0`、`networkidle2` |
| `timeout_ms` | 单个动作超时，1000–60000，默认 15000 |
| `full_page` | `screenshot` 截整页，默认 `false` |

截图保存在 `/workspace/browser-output/` 下，文件名形如 `t1-1.png`，工具结果给出路径；Agent 使用的模型支持图像输入时，截图同时作为图片回给模型。页面超时、选择器不存在、导航失败以 `error: …` 文本返回。浏览器空闲 10 分钟后自动关闭。

### `eval`

| 参数 | 说明 |
| --- | --- |
| `code` | 必填，要执行的 Python 代码 |
| `timeout` | 超时秒数，1–600，默认 60；超时后中断该次执行 |
| `reset` | `true` 时先重启内核、丢弃全部变量，默认 `false` |

同一对话的多次调用共用一个内核，变量、导入与函数一直保留。代码最后一行是表达式时，它的值像 notebook 一样返回。结果依次是标准输出，以及（非空时）`--- stderr ---`、`--- value ---`、`--- error ---`、`--- images ---` 段。代码里可以用：

- `tool("工具名", **参数)`：调用 Agent 的其他工具，返回其 JSON 值，失败时抛 `ToolError`；`eval` 不能调用自己。
- `show(对象)`：附一张图片，支持 matplotlib 图、PIL 图片、PNG / JPEG / GIF / WebP 字节或图片文件路径；图片写到 `/workspace/eval-output/`，模型支持图像输入时一并回给模型。

### `web_search`

| 参数 | 说明 |
| --- | --- |
| `query` | 必填，最长 500 字符 |
| `recency` | 只要最近的结果：`day`、`week`、`month`、`year` |
| `limit` | 返回来源数，1–20，默认 8 |

结果首行 `Provider: duckduckgo`（或实际回答的后端）；前面的后端失败时第二行为 `Note: answered by … after … failed (…)`；后端给出摘要时有 `## Answer` 段；然后是 `## Sources (N)`，每条为序号加标题、URL 与摘要。

### `generate_image`

| 参数 | 说明 |
| --- | --- |
| `prompt` | 必填，最长 4000 字符 |
| `size` | `1024x1024`（默认）、`1536x1024`、`1024x1536`；Gemini 模型按宽高比写进提示词 |
| `file_name` | 只对有沙箱 Agent 生效，字母、数字、`.`、`_`、`-`，最长 120 字符；默认 `image-` 加毫秒时间戳 |

- 有沙箱 Agent：图片写到 `/workspace/generated/`，同名文件已存在时在扩展名前加 `-1`、`-2`；结果列出文件路径，模型支持图像输入时同时回给模型。对话右栏「电脑」标签里可以看到该文件。
- 无沙箱 Agent：图片存入对象存储，结果给出 24 小时有效的下载链接 `url`；模型本身看不到图片。

## 出错时

| 现象 | 处理 |
| --- | --- |
| `browser` 返回 `Chromium failed to launch (…); 沙箱镜像需包含 chromium` | 部署使用的沙箱镜像没有 Chromium 或 microVM 内无法启动；按 [Firecracker 沙箱](/deploy/firecracker) 重新构建 rootfs 并更新运行时节点 |
| `lsp` 返回 `No language server available for .go. Available: …` | 该扩展名的 language server 不在沙箱里。TypeScript / Python 之外的语言需要在工作区安装对应 server |
| `web_search` 返回 `web search failed: duckduckgo: blocked or empty` | DuckDuckGo 拦截了部署的出口 IP；按 [配置网页搜索后端](#配置网页搜索后端) 配置带 key 的后端 |
| `generate_image` 返回 `{"error": "默认图像模型的提供商协议 … 不支持图像生成…"}` | 默认图像模型的服务商不是 OpenAI 兼容或 Gemini 协议，换一个模型配置设为默认 |
| 写入 `.ts` 后不再附带诊断，`lsp` 的 `diagnostics` 返回 `No diagnostics published …` 或旧结果 | 沙箱内存不足，TypeScript 语言服务被 OOM 终止；把沙箱内存调到 2 GiB 或以上 |
| `generate_image` 返回 `{"error": "模型未返回图片"}` 或带 HTTP 状态码的错误 | 模型拒绝了提示词或服务商报错，按错误内容调整提示词或检查服务商额度 |
| `eval` 返回 `Execution interrupted (timeout)` | 代码超过 `timeout`；调大 `timeout`。下一次调用内核仍可用，若结果首行为 `[kernel restarted — …]` 则之前的变量已丢失 |
| 对话开始时报 `runtime 插件未能加载:` 且列出 `agentloom-lsp`、`agentloom-ast`、`agentloom-browser` 或 `agentloom-eval` | 沙箱镜像与 guest 服务版本不一致或镜像损坏；重新构建 Firecracker 产物。临时绕过可在 Agent Main 关闭对应开关后重新发布 |
| Harness 的 profile patch 解除了 `tool-web` 等禁用条目后，对话开始时报工具 `web_search` 重名 | dsh 自带的 `web_search` 与平台的 `web_search` 冲突；删除 patch 中解除禁用的条目 |

## 相关

- [创建 Agent](/guide/agents/creating)：运行形态与 Agent Main 的其他设置
- [用 Harness 定制 Agent 运行时](/guide/agents/harness)：挂载更多 runtime 插件
- [Agent 运行态](/dev/server/agent-runtime#内置工具)：内置工具的实现机制
