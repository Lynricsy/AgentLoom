---
description: 同步上游：审阅已追踪上游的更新与新能力，发现值得追踪的新仓库，按切片合入
argument-hint: "[上游名，留空则全部]"
---

# 同步上游

目标：把 AgentLoom 依赖的上游项目同步到值得的最新状态。三件事都要做，缺一不算完成：

1. **已追踪上游的更新**：钉住版本到上游最新之间的变更，包括破坏性变更、安全修复、缺陷修复。
2. **已追踪上游的新能力**：上游新增的包、插件、API、配置项、子命令。它们不会出现在我们已用到的代码的 diff 里，要主动去找，再判断是否值得接入。
3. **新的上游**：是否出现值得开始追踪、甚至直接接入的新仓库。

范围参数：`$ARGUMENTS`。为空时处理 `agentloom-docs/dev/upstreams.md`「已追踪上游」表中的全部上游，并执行第 3 步；指定上游名时只处理该上游，跳过第 3 步。

## 0. 建立基线

1. 读 `agentloom-docs/dev/upstreams.md`：每个上游的仓库、钉版位置、接入层、机制文档、上次审阅到哪里，以及「评估后暂不合入」表。
2. 用 `search-logs` 查以往的上游同步与评估记录（关键词：上游、升级、上游名），不要重复评估已有结论且重新评估条件未满足的能力。
3. 从「钉版位置」列的文件读出当前钉住的版本；钉版以这些文件为准，`upstreams.md` 不记录钉版。
4. `git status` 确认工作区干净。不干净时先问用户如何处理，不要把别人的改动混进同步提交。

## 1. 收集上游变化

每个上游并行派一个只读 `scout` 子代理（同时不超过 5 个），各自回答下列问题，结论附出处链接或提交号：

- 「上次审阅到」与上游最新发布之间有哪些版本（npm：`npm view <包> versions dist-tags time`；Go：`go list -m -versions`；GitHub：releases、tags）。预发布线（如 `rc`、`next`）单独列出。
- 每个版本的 CHANGELOG、release notes 与关键提交：破坏性变更、废弃、安全修复、缺陷修复。
- **对照我们的接入层逐项核对**：接入层文件用到的每个导入符号、配置键、协议消息、CLI 参数、环境变量，在新版本里是否改名、删除或改语义。这一步要读上游源码，不要只看 changelog。
- **新能力清单**：新增的包（同一 monorepo 下新发布的包名，例如 `npm search` scope 或仓库 `packages/` 目录对比）、插件、导出 API、配置项、子命令。对每项写一句「它能让 AgentLoom 做到什么现在做不到的事」。
- 包名、scope 或仓库是否迁移（pi 曾从 `badlogic/pi-mono` 迁到 `earendil-works/pi`，scope 从 `@mariozechner` 换成 `@earendil-works`）。

## 2. 分诊

把结果整理成一张表，每行一项，结论只有三种：

| 结论 | 条件 |
| --- | --- |
| 合入 | 安全修复；我们踩到或可能踩到的缺陷修复；不再升级就会断供（scope 迁移、旧版停更）；新能力直接改善现有产品行为，且接入面清楚 |
| 暂不合入 | 有价值但代价、风险或需求不明：记入 `upstreams.md`「评估后暂不合入」，写清理由与重新评估的条件 |
| 忽略 | 与 AgentLoom 无关；不入表 |

判断时用第一性原理：这项变化改变了平台的什么能力或风险？不要因为「版本新」就升，也不要因为「怕麻烦」就跳过安全修复。

需要用户拍板的情况：改变跨包契约、运行时模型或安全边界；新能力会新增用户可见功能或计费、权限面；一次合入预计跨三个以上包。把分诊表和推荐方案一起给用户，用 `ask` 让用户选；其余情况直接按表执行，最后汇报。

## 3. 发现新上游

只在范围参数为空时执行。

候选来源：

- 已追踪上游的生态：同一组织或 monorepo 下新出现的仓库与包，上游 README、文档里推荐的插件与集成。
- 我们的薄弱处：`agentloom-docs/dev/upstreams.md` 与各 `dev/` 页、ADR 中记录的限制、`.agent-logs` 中的遗留与「未验证」项、仓库里的 TODO。按「这个限制有没有现成上游能解决」去 `web_search`。
- 同类项目：Agent 运行时、沙箱、工作流编排、MCP 生态中近期活跃的项目。

每个候选回答：解决我们哪个具体问题；许可证是否兼容本仓库 `LICENSE`；维护活跃度（近期发布与提交、issue 响应）；接入面多大、放在哪一层；与现有上游重叠时是替换还是并存。

结论：

- 值得追踪但暂不接入：在 `upstreams.md` 中新增一节「观察中」，登记仓库与理由；不改代码。
- 值得接入：属于架构级取舍（新运行时、替换现有上游、新安全边界）时先写 ADR（`agentloom-docs/dev/decisions/`，流程见 `agentloom-docs/dev/docs-maintenance.md` 第 7 章），交给用户确认后再动代码；只是给现有能力加一个可选插件或工具时，直接按第 4 步合入。
- 接入后把它加进「已追踪上游」表，符合页面上写的登记标准才登记。

## 4. 合入

每个上游一个切片，切片内按「升级 → 适配 → 新能力」顺序，每完成一步提交一次。

- 升级依赖：
  - pnpm workspace 成员：改对应 `package.json` 后在仓库根 `pnpm install`；跨包共享的版本放 `pnpm-workspace.yaml` 的 catalog。
  - `agentloom-deploy/sandbox/` 不在 workspace 内，用 npm：在该目录 `npm install <包>@<版本> --save-exact`，提交更新后的 `package-lock.json`。
  - Go：在 `agentloom-firecracker-runtime/` 执行 `go get <模块>@<版本> && go mod tidy`。
  - Firecracker 二进制：改 `agentloom-deploy/firecracker/build-artifacts.sh` 中的版本，按 `agentloom-docs/deploy/firecracker.md` 重建 rootfs 后冒烟。
- 适配破坏性变更时遵守仓库硬规则：pi 系列纯 ESM，只能经 `agentloom-server/src/modules/agent/pi-imports.ts` 惰性导入；dsh 平台层的条目调整集中在 `agentloom-deploy/sandbox/src/dsh/profile-writer.ts`。上游删掉的能力不要用 shim 兜底，迁到新 API；无调用方的旧适配代码一并删除。
- 接入新能力按普通功能开发：契约、文档、guide 页一样不少（见根 `AGENTS.md` 的提交前门禁与 `agentloom-docs/dev/docs-maintenance.md` 第 4 章矩阵）。
- 子代理并行时每个切片独立 worktree 或独立文件范围，同时不超过 5 个；由你负责集成与最终验证。
- 提交信息格式 `<type>(<scope>): <gitmoji> <subject>`，升级用 `build`/`chore` + ⬆️，并在正文写清：从哪个版本到哪个版本、适配了哪些破坏性变更、刻意没引入什么以及为什么。末尾附 `Co-authored-by: Wine Fox <fox@ling.plus>`。

## 5. 验证

- 仓库根 `pnpm typecheck:all && pnpm test:all`，必须全绿；失败按回归处理查根因。
- 冒烟实际运行改动的路径，测试通过不等于可用：
  - pi：用测试模型（凭据只取自 `AGENTLOOM_TEST_MODEL_*` 环境变量）跑一次 `no_sandbox` Agent 对话，确认流式输出与工具调用。
  - dsh、Firecracker、firecracker-go-sdk、sandbox 预装工具：重建 rootfs，运行 `agentloom-deploy/firecracker/firecracker-smoke.sh`，有模型凭据时要求出现 `text_delta` 与 `done`。
  - 新接入的能力：按其用户可见路径在 Studio 或 API 上实际走一遍。
- 无法冒烟的项在最终汇报与日志里明确写「未验证」及缺什么前提，不要宣称完成。

## 6. 收尾

1. 更新 `agentloom-docs/dev/upstreams.md`：每个审阅过的上游的「上次审阅到」（版本或提交号与日期，即使这次没有合入任何东西）；「评估后暂不合入」增删条目；新上游登记或移入「观察中」。
2. 接入层行为有变化时更新「机制文档」列指向的页面；页面中写死的上游版本号随之更新。
3. 运行 `pnpm docs:check`；新增或移动文档页时还要在 `agentloom-docs/` 下 `pnpm build` 与 `pnpm lint:md`。
4. 用 `record-agent-log` 记录：审阅范围、合入了什么、暂不合入什么及理由、新上游的结论、验证结果与未验证项。
5. 推送，并给用户一份简短汇报：每个上游一行（版本变化、合入项、暂不合入项），新上游结论，未验证项。
