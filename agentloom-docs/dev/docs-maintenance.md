---
docType: howto
---

# 文档维护指南

改了代码之后，文档要改哪里、怎样改、怎样确认没有漂移。本页是文档站 `agentloom-docs/` 的维护规则，适用于人和 AI 代理。体系的设计来由见 [ADR 0002](/dev/decisions/0002-docs-system)。

## 1. 分区与页面类型

站点有四个分区，每个分区只服务一类读者：

| 分区 | 读者 | 内容 |
| --- | --- | --- |
| `agentloom-docs/guide/` 用户指南 | 使用 Studio 与移动端的人 | 产品操作、节点参考、排错 |
| `agentloom-docs/api/` API 与集成 | 从外部调用平台、开发插件的人 | 凭证、REST、Agent 对外 API、Webhook、插件 |
| `agentloom-docs/deploy/` 部署运维 | 部署与运维平台的人 | Compose、Helm、配置、Supabase、Firecracker、备份、反向代理 |
| `agentloom-docs/dev/` 贡献者 | 修改本仓库代码的人 | 架构、各包机制、操作指南、决策记录 |

每页只属于 Diátaxis 四类之一，frontmatter 第一项 `docType` 写明类型（导航页用 `index`）：

| `docType` | 类型 | 判定 |
| --- | --- | --- |
| `tutorial` | 教程 | 一条路径带读者得到一个结果，每步有可观察输出 |
| `howto` | 操作指南 | 以读者的问题命名，给出解决步骤，允许有限的分支 |
| `reference` | 参考 | 统一条目格式，读者 30 秒内能定位一个事实 |
| `explanation` | 解释 | 顶部一句 why 问题，讲机制与取舍，不带操作步骤 |

一页混了两类时拆开，外来的段落移到已有的对应页，不在原处留摘要。

命名：目录与文件用 kebab-case；节点页文件名等于 `NODE_TYPES` 中的类型值（触发器类、循环内部类、迭代起点类型分别并入 `trigger.md`、`loop.md`、`iteration.md`）。

## 2. 事实的唯一家

同一个事实只写在一个地方，其他地方只放链接：

| 事实 | 唯一的家 |
| --- | --- |
| 开发命令 | 根 `README.md` 与各包 `README.md` |
| 贡献者规则、提交门禁 | 根与各包 `AGENTS.md` |
| 清单（模块、队列、表、环境变量、节点、端口类型、技能、feature、路由） | `agentloom-docs/_generated/`（生成，见第 3 章） |
| 系统行为与机制 | 对应的 `dev/` 页 |
| 用户操作步骤 | 对应的 `guide/` 页 |
| 对外接口约定 | 对应的 `api/` 页 |
| 部署步骤与配置 | 对应的 `deploy/` 页 |
| 架构决策及其理由 | `dev/decisions/` 下的 ADR |

要在第二处提到某个事实时，写一句话加链接，不复制内容。

## 3. 生成式参考

清单类事实由 `scripts/docs-reference/generate.ts` 从源码生成到 `agentloom-docs/_generated/`，页面在需要的位置写一行 VitePress 的 `@include` 注释引用生成文件（路径相对当前文件；`dev/server/` 下的页面指向 `../../_generated/` 下的文件），写法照抄任一节点页或 [队列](/dev/server/queues) 页的源码。

| 产物 | 真相源 |
| --- | --- |
| `server-modules.md` | `agentloom-server/src/modules/` 下各目录的 `@Controller` 前缀、网关命名空间、队列常量 |
| `queues.md` | server 源码中的 `*_QUEUE = '…'` 常量与 `@Processor(...)` 所在的 worker 类 |
| `tables.md` | `agentloom-server/src/database/schema/index.ts` 导出的 Drizzle 表 |
| `env-server.md` | `agentloom-server/src/config/env.schema.ts` 的 `envSchema` + `agentloom-server/.env.example` 中变量上方的注释 |
| `env-deploy.md` | `agentloom-deploy/.env.template` |
| `env-studio.md` | `agentloom-studio/.env.example` |
| `node-types.md`、`nodes/<type>.md` | `agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts` 与 `agentloom-studio/src/features/canvas/components/nodeCategories.ts` |
| `port-data-types.md` | `agentloom-contracts/src/port-data-type.ts`、`agentloom-contracts/src/port-compatibility.ts` |
| `socket-events.md` | `agentloom-contracts/src/execution-events.ts` 的 `EXECUTION_EVENT_NAMES` 与各 `*.gateway.ts` |
| `builtin-skills.md` | `agentloom-server/src/database/seeds/skill-seeds.ts` 的 `BUILTIN_SKILL_SLUGS` 与各 SKILL.md frontmatter |
| `studio-features.md` | `agentloom-studio/src/features/` 下的目录 |
| `studio-routes.md` | `agentloom-studio/src/app/routes/` 中 `createRoute({ path })` 的路径 |
| `mobile-features.md` | `agentloom_mobile/lib/features/` 下的目录 |

在仓库根运行：

```bash
pnpm docs:gen    # 重新生成 _generated/
pnpm docs:check  # 漂移检查，失败时退出码为 1
```

`docs:check` 检查五项：生成产物与磁盘一致；页面反引号中的仓库路径存在；反引号中的环境变量名能在代码或模板中找到；每个节点类型都有承载页面且含对应 include；根下每个 `agentloom*` 目录都出现在 [贡献者入口](/dev/) 的仓库地图中。`_generated/` 的变更与触发它的代码一起提交。

禁止手写：上表中任何清单，以及任何计数或行数（"N 个模块""约 700 行"）。页面需要列举时 include 生成文件；需要表达规模时不写数字。

## 4. 变更 → 文档矩阵

| 你改了什么 | 要做什么 |
| --- | --- |
| 新增或删除 server 模块 | `pnpm docs:gen`；在 [模块与分域](/dev/server/) 的分域说明中增删一句 |
| 新队列或改重试策略 | `pnpm docs:gen`；更新 [队列](/dev/server/queues) 的重试策略行 |
| 新表或迁移 | `pnpm docs:gen`；更新 [数据库](/dev/server/database) 的 ER 图 |
| 环境变量 | `pnpm docs:gen`；影响部署时更新 [Helm 部署](/deploy/helm) 或 [Compose 部署](/deploy/compose)；步骤见 [新增环境变量](/dev/howto/add-env-var) |
| 节点类型 | `pnpm docs:gen`；新建或更新 `guide/nodes/` 下的节点页；步骤见 [新增节点类型](/dev/howto/add-node-type) |
| Socket 事件 | `pnpm docs:gen`；事件语义变化时更新 [实时通信](/dev/server/realtime) |
| REST 端点 | `pnpm contracts:regen`（OpenAPI 自动进入 [REST 参考](/api/rest)）；用户可见时更新对应 guide 页 |
| 部署资产（compose、Helm、脚本、`.env.template`） | 更新对应 `deploy/` 页；`pnpm docs:gen` |
| Studio 路由或 feature | `pnpm docs:gen`；用户可见时更新对应 guide 页 |
| Mobile feature | `pnpm docs:gen`；更新 [Flutter 应用](/dev/mobile) |
| 跨包契约、运行时模型、安全边界等架构级决定 | 写 ADR（第 7 章） |

## 5. 写作门禁

每条都可以逐页检查：

1. 前置条件写在第一个代码块之前，包括要设置的环境变量名与启动依赖服务的命令。
2. 教程与操作指南的每一步以可观察的结果结束（命令输出、页面上出现的文字、文件变化）。
3. 代码块可以整段粘贴运行；省略的部分用该语言的注释标出，不写 `...` 或 `…`。
4. 页面中的输出来自真实运行；没能运行的块在页面顶部用 `::: warning 未在本轮验证` 列出。
5. 符号、默认值、命令、环境变量、路由、按钮文案对照定义处的源码核对，不对照调用处或旧文档。
6. 不写「重要」「强大」「轻松」「完整」一类断言重要性的形容词；没有数字支撑的性能或质量形容词删掉。
7. 一个概念一个名字，全站同一写法；UI 文案用 Studio 源码中的真实字样。
8. 内链用站内绝对路径（`/guide/…`、`/api/…`、`/deploy/…`、`/dev/…`），不带 `.md`。

## 6. 新增或移动页面

1. 在对应分区建文件，frontmatter 写 `docType`。
2. 在 `agentloom-docs/.vitepress/sidebar/` 下对应分区的文件（`guide.ts`、`api.ts`、`deploy.ts`、`dev.ts`）中登记；移动页面时同时修改所有指向旧路径的链接。
3. 构建，站点配置 `ignoreDeadLinks: false`，任何死链都会让构建失败：

   ```bash
   cd agentloom-docs
   pnpm build
   ```

4. 检查 Markdown 风格：

   ```bash
   pnpm lint:md
   ```

两条命令退出码都为 0 才提交。

## 7. ADR

**何时写**：改变跨包契约、运行时模型、安全边界、文档体系，或者在多个可行方案之间做了取舍、以后的人会问"为什么不用另一种"时。

**怎么写**：在 `agentloom-docs/dev/decisions/` 下新建 `NNNN-<kebab-标题>.md`，编号在现有最大号上加一；按 [ADR 索引](/dev/decisions/) 中的模板填写字段，并在索引表中加一行、在 `dev.ts` 侧边栏登记。

**状态流转**：提议 → 已接受 → 已实施；被取代时改为「已废弃（被 NNNN 取代）」。已接受的 ADR 不改正文，只追加状态变化；决定变了就写一篇新的 ADR 取代它。

## 8. AGENTS.md 维护

- AGENTS.md 只放规则、门禁与文档路由表，不放事实性描述。
- 新的事实写进对应文档页，然后在 AGENTS.md 的路由表加一行指向该页。
- 任何 AGENTS.md 的改动，同时检查根 `README.md` 的「文档」一节链接是否仍然正确。

## 9. 审计节奏

- 每次功能提交前运行 `pnpm docs:check`。
- 每完成一个较大的功能，按第 4 章的矩阵逐行自检。
- 每季度抽样审计：按 technical-writing 技能的 audit 流程，对照源码核对一批页面，报告用 `record-agent-log` 记录到 `.agent-logs`。审计只出报告；修复另行提交。

## 10. 本地命令

在仓库根：

```bash
pnpm install
pnpm docs:gen
```

预览与构建（文档站不是 workspace 成员，有独立的依赖与 lockfile）：

```bash
cd agentloom-docs
pnpm install
pnpm dev
```

`pnpm dev` 与 `pnpm build` 之前会自动运行 `agentloom-docs/scripts/sync-openapi.mjs`，把 `agentloom-server/sdk/openapi.json` 复制到站点；源文件不存在时脚本报错退出，先在 `agentloom-server/` 运行 `pnpm openapi:export`。

构建文档镜像（仓库根）：

```bash
docker build -f agentloom-deploy/docker/docs.Dockerfile .
```
